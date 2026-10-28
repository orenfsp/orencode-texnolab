
import base64
import hashlib
import secrets
from datetime import timedelta
from typing import Annotated
from urllib.parse import urlencode

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import APIRouter, Form, Header, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select

from ..config import settings
from ..deps import DB, AdminPrincipal, CurrentPrincipal
from ..models import OAuthClient, OAuthCode, OAuthConsent, User
from ..models.base import as_utc, utcnow
from ..security import hash_password, verify_password
from ..services import evsk
from ..services.audit import log_action

router = APIRouter(tags=["ФСП ID (OpenID Connect)"])

SCOPES = {
    "openid": "Идентификатор аккаунта ФСП ID",
    "profile": "ФИО",
    "email": "Адрес электронной почты",
    "roles": "Роли: спортсмен, тренер, судья",
    "sport": "Дисциплины и спортивный разряд",
}
TOKEN_TTL = timedelta(hours=1)
_KID = "fsp56-1"


def _key() -> rsa.RSAPrivateKey:
    path = settings.storage_dir / "oidc_private_key.pem"
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    return key


def _b64(n: int) -> str:
    return base64.urlsafe_b64encode(n.to_bytes((n.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()


@router.get("/.well-known/openid-configuration")
def discovery():
    iss = settings.issuer
    return {
        "issuer": iss,
        "authorization_endpoint": f"{iss}/oauth/authorize",
        "token_endpoint": f"{iss}/oauth/token",
        "userinfo_endpoint": f"{iss}/oauth/userinfo",
        "jwks_uri": f"{iss}/oauth/jwks",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
        "scopes_supported": list(SCOPES),
        "claims_supported": ["sub", "name", "family_name", "given_name", "middle_name", "email", "roles", "disciplines", "sport_rank"],
    }


@router.get("/oauth/jwks")
def jwks():
    pub = _key().public_key().public_numbers()
    return {"keys": [{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": _KID, "n": _b64(pub.n), "e": _b64(pub.e)}]}


def _client(db: DB, client_id: str, redirect_uri: str) -> OAuthClient:
    c = db.scalar(select(OAuthClient).where(OAuthClient.client_id == client_id))
    if c is None:
        raise HTTPException(400, "Неизвестное клиентское приложение")
    if redirect_uri not in c.redirect_uris:
        raise HTTPException(400, "redirect_uri не зарегистрирован для этого приложения")
    return c


@router.get("/oauth/authorize")
def authorize_redirect(
    db: DB, client_id: str, redirect_uri: str, response_type: str = "code", scope: str = "openid",
    state: str | None = None, code_challenge: str | None = None, code_challenge_method: str | None = None,
    nonce: str | None = None,
):
    _client(db, client_id, redirect_uri)
    if response_type != "code":
        raise HTTPException(400, "Поддерживается только response_type=code")
    if not code_challenge or code_challenge_method != "S256":
        raise HTTPException(400, "Требуется PKCE: code_challenge и code_challenge_method=S256")
    query = {k: v for k, v in dict(client_id=client_id, redirect_uri=redirect_uri, scope=scope, state=state,
                                   code_challenge=code_challenge, nonce=nonce).items() if v}
    return RedirectResponse(f"{settings.public_base_url}/oauth/consent?{urlencode(query)}")


@router.get("/api/oauth/client-info")
def client_info(db: DB, client_id: str, redirect_uri: str, scope: str = "openid"):
    c = _client(db, client_id, redirect_uri)
    return {"name": c.name, "scopes": [{"scope": s, "title": SCOPES[s]} for s in scope.split() if s in SCOPES]}


class AuthorizeIn(BaseModel):
    client_id: str
    redirect_uri: str
    scope: str = "openid"
    state: str | None = None
    code_challenge: str
    nonce: str | None = None
    allow: bool


@router.post("/api/oauth/authorize")
def authorize(data: AuthorizeIn, db: DB, p: CurrentPrincipal):
    _client(db, data.client_id, data.redirect_uri)
    params: dict[str, str] = {"state": data.state} if data.state else {}
    if not data.allow:
        params["error"] = "access_denied"
        return {"redirect_to": f"{data.redirect_uri}?{urlencode(params)}"}
    scope = " ".join(s for s in data.scope.split() if s in SCOPES)
    code = secrets.token_urlsafe(32)
    db.add(OAuthCode(code=code, client_id=data.client_id, user_id=p.id, redirect_uri=data.redirect_uri, scope=scope,
                     nonce=data.nonce, code_challenge=data.code_challenge, expires_at=utcnow() + timedelta(minutes=5)))
    db.add(OAuthConsent(user_id=p.id, client_id=data.client_id, scope=scope))
    log_action(db, p, "consent", "oauth_client", None, client_id=data.client_id, scope=scope)
    db.commit()
    params["code"] = code
    return {"redirect_to": f"{data.redirect_uri}?{urlencode(params)}"}


def _claims(db: DB, u: User, scope: str) -> dict:
    scopes = set(scope.split())
    claims: dict = {"sub": str(u.id)}
    if "profile" in scopes:
        claims |= {"name": u.full_name, "family_name": u.last_name, "given_name": u.first_name, "middle_name": u.middle_name}
    if "email" in scopes:
        claims["email"] = u.email
    if "roles" in scopes:
        claims["roles"] = sorted(r.value for r in u.role_set)
    if "sport" in scopes and u.athlete:
        claims["disciplines"] = [d.name for d in u.athlete.disciplines]
        ranks = []
        for d in u.athlete.disciplines:
            cur = evsk.current_rank(db, u.id, d.id)
            if cur:
                ranks.append({"discipline": d.name, "rank": cur.rank.name, "valid_until": cur.valid_until.isoformat() if cur.valid_until else None})
        claims["sport_rank"] = ranks
    return claims


def _oauth_error(error: str, description: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": error, "error_description": description}, status_code=status)


@router.post("/oauth/token")
def token(
    db: DB,
    grant_type: Annotated[str, Form()],
    code: Annotated[str, Form()],
    redirect_uri: Annotated[str, Form()],
    client_id: Annotated[str, Form()],
    code_verifier: Annotated[str, Form()],
    client_secret: Annotated[str | None, Form()] = None,
):
    if grant_type != "authorization_code":
        return _oauth_error("unsupported_grant_type", "Поддерживается authorization_code")
    rec = db.get(OAuthCode, code)
    if rec is None or rec.used or as_utc(rec.expires_at) < utcnow():
        return _oauth_error("invalid_grant", "Код недействителен или истёк")
    if rec.client_id != client_id or rec.redirect_uri != redirect_uri:
        return _oauth_error("invalid_grant", "Код выдан другому приложению")
    client = db.scalar(select(OAuthClient).where(OAuthClient.client_id == client_id))
    if client.secret_hash and not (client_secret and verify_password(client_secret, client.secret_hash)):
        return _oauth_error("invalid_client", "Неверный секрет клиента", 401)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).rstrip(b"=").decode()
    if challenge != rec.code_challenge:
        return _oauth_error("invalid_grant", "PKCE: code_verifier не соответствует code_challenge")
    rec.used = True
    db.commit()
    user = db.get(User, rec.user_id)
    now = utcnow()
    key = _key()
    base = {"iss": settings.issuer, "sub": str(user.id), "aud": client_id, "iat": now, "exp": now + TOKEN_TTL}
    id_token = jwt.encode(base | {"nonce": rec.nonce} | _claims(db, user, rec.scope), key, algorithm="RS256", headers={"kid": _KID})
    access = jwt.encode(base | {"scope": rec.scope, "token_use": "access"}, key, algorithm="RS256", headers={"kid": _KID})
    return {"access_token": access, "id_token": id_token, "token_type": "Bearer", "expires_in": int(TOKEN_TTL.total_seconds()), "scope": rec.scope}


@router.get("/oauth/userinfo")
def userinfo(db: DB, request: Request, authorization: Annotated[str | None, Header()] = None):
    if not authorization or not authorization.startswith("Bearer "):
        return _oauth_error("invalid_token", "Нужен access_token", 401)
    try:
        claims = jwt.decode(authorization[7:], _key().public_key(), algorithms=["RS256"], options={"verify_aud": False},
                            issuer=settings.issuer)
    except jwt.PyJWTError as e:
        return _oauth_error("invalid_token", str(e), 401)
    if claims.get("token_use") != "access":
        return _oauth_error("invalid_token", "Это не access_token", 401)
    user = db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        return _oauth_error("invalid_token", "Пользователь не найден", 401)
    return _claims(db, user, claims.get("scope", "openid"))




class ClientIn(BaseModel):
    name: str
    redirect_uris: list[str]
    confidential: bool = False


@router.get("/api/admin/oauth-clients")
def list_clients(db: DB, _: AdminPrincipal):
    return [{"id": c.id, "client_id": c.client_id, "name": c.name, "redirect_uris": c.redirect_uris,
             "confidential": c.secret_hash is not None, "created_at": c.created_at}
            for c in db.scalars(select(OAuthClient).order_by(OAuthClient.id))]


@router.post("/api/admin/oauth-clients", status_code=201)
def create_client(data: ClientIn, db: DB, p: AdminPrincipal):
    if not data.redirect_uris or not all(u.startswith(("http://", "https://")) for u in data.redirect_uris):
        raise HTTPException(422, "Укажите корректные redirect_uri")
    secret = secrets.token_urlsafe(24) if data.confidential else None
    c = OAuthClient(client_id="fsp-" + secrets.token_hex(6), name=data.name, redirect_uris=data.redirect_uris,
                    secret_hash=hash_password(secret) if secret else None)
    db.add(c)
    db.flush()
    log_action(db, p, "create", "oauth_client", c.id, name=c.name)
    db.commit()
    return {"client_id": c.client_id, "client_secret": secret, "name": c.name, "redirect_uris": c.redirect_uris}
