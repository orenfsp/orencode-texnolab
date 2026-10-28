
import hashlib
import secrets
from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select

from ..deps import DB, AdminPrincipal
from ..models import (
    ApiToken,
    Application,
    ApplicationStatus,
    Competition,
    CompetitionStatus,
    Protocol,
    Result,
    Webhook,
    WebhookDelivery,
)
from ..models.base import utcnow
from ..services import protocol as proto
from ..services import webhooks
from ..services.audit import log_action
from ..services.notifications import deliver_in_background, notify

router = APIRouter(prefix="/api", tags=["integrations"])

SCOPES = {
    "competitions:read": "Календарь соревнований",
    "protocols:read": "Опубликованные протоколы",
    "results:write": "Импорт результатов и формирование протокола",
}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()




class TokenIn(BaseModel):
    name: str
    scopes: list[str] = Field(min_length=1)


@router.get("/admin/api-tokens")
def list_tokens(db: DB, _: AdminPrincipal):
    return {
        "scopes": SCOPES,
        "items": [
            {"id": t.id, "name": t.name, "prefix": t.prefix, "scopes": t.scopes, "created_at": t.created_at,
             "last_used_at": t.last_used_at, "revoked": t.revoked_at is not None}
            for t in db.scalars(select(ApiToken).order_by(ApiToken.id.desc()))
        ],
    }


@router.post("/admin/api-tokens", status_code=201)
def create_token(data: TokenIn, db: DB, p: AdminPrincipal):
    if unknown := set(data.scopes) - SCOPES.keys():
        raise HTTPException(422, f"Неизвестные права: {', '.join(sorted(unknown))}")
    raw = "fsp_" + secrets.token_urlsafe(32)
    t = ApiToken(name=data.name, prefix=raw[:10], token_hash=_hash(raw), scopes=data.scopes, created_by_id=p.id)
    db.add(t)
    db.flush()
    log_action(db, p, "create", "api_token", t.id, scopes=data.scopes)
    db.commit()
    return {"id": t.id, "token": raw, "name": t.name, "scopes": t.scopes}


@router.delete("/admin/api-tokens/{tid}", status_code=204)
def revoke_token(tid: int, db: DB, p: AdminPrincipal):
    t = db.get(ApiToken, tid)
    if t is None:
        raise HTTPException(404, "Токен не найден")
    t.revoked_at = utcnow()
    log_action(db, p, "revoke", "api_token", t.id)
    db.commit()




class WebhookIn(BaseModel):
    url: HttpUrl
    events: list[str] = Field(min_length=1)


@router.get("/admin/webhooks")
def list_webhooks(db: DB, _: AdminPrincipal):
    out = []
    for w in db.scalars(select(Webhook).order_by(Webhook.id)):
        last = db.scalars(select(WebhookDelivery).where(WebhookDelivery.webhook_id == w.id).order_by(WebhookDelivery.id.desc()).limit(10)).all()
        out.append({"id": w.id, "url": w.url, "events": w.events, "is_active": w.is_active, "secret": w.secret,
                    "deliveries": [{"event": d.event, "status_code": d.status_code, "error": d.error, "at": d.created_at} for d in last]})
    return {"events": webhooks.EVENTS, "items": out}


@router.post("/admin/webhooks", status_code=201)
def create_webhook(data: WebhookIn, db: DB, p: AdminPrincipal):
    if unknown := set(data.events) - webhooks.EVENTS.keys():
        raise HTTPException(422, f"Неизвестные события: {', '.join(sorted(unknown))}")
    w = Webhook(url=str(data.url), events=data.events, secret=secrets.token_hex(16))
    db.add(w)
    db.flush()
    log_action(db, p, "create", "webhook", w.id, url=w.url)
    db.commit()
    return {"id": w.id, "url": w.url, "events": w.events, "secret": w.secret}


@router.delete("/admin/webhooks/{wid}", status_code=204)
def delete_webhook(wid: int, db: DB, p: AdminPrincipal):
    w = db.get(Webhook, wid)
    if w is None:
        raise HTTPException(404, "Вебхук не найден")
    w.is_active = False
    log_action(db, p, "delete", "webhook", w.id)
    db.commit()




def api_client(*required: str):
    def dep(
        db: DB,
        x_api_key: Annotated[str | None, Header()] = None,
        authorization: Annotated[str | None, Header()] = None,
    ) -> ApiToken:
        raw = x_api_key or (authorization[7:] if authorization and authorization.startswith("Bearer fsp_") else None)
        if not raw:
            raise HTTPException(401, "Передайте токен в заголовке X-API-Key")
        t = db.scalar(select(ApiToken).where(ApiToken.prefix == raw[:10], ApiToken.token_hash == _hash(raw)))
        if t is None or t.revoked_at:
            raise HTTPException(401, "Токен недействителен или отозван")
        if missing := set(required) - set(t.scopes):
            raise HTTPException(403, f"У токена нет прав: {', '.join(sorted(missing))}")
        t.last_used_at = utcnow()
        db.commit()
        return t

    return dep


def _comp_public(c: Competition) -> dict:
    return {"id": c.id, "title": c.title, "discipline": c.discipline.code, "discipline_name": c.discipline.name,
            "type": c.type.name, "level": c.level.value, "age_group": c.age_group.code, "format": c.format.value,
            "start_date": c.start_date, "end_date": c.end_date, "registration_deadline": c.registration_deadline,
            "status": c.status.value, "calendar_plan": c.calendar_plan.value, "calendar_plan_number": c.calendar_plan_number}


@router.get("/ext/v1/competitions", tags=["external API v1"])
def ext_competitions(db: DB, _: Annotated[ApiToken, Depends(api_client("competitions:read"))], year: int | None = None):
    stmt = select(Competition).where(Competition.status != CompetitionStatus.DRAFT).order_by(Competition.start_date)
    if year:
        stmt = stmt.where(Competition.start_date.between(date(year, 1, 1), date(year, 12, 31)))
    return [_comp_public(c) for c in db.scalars(stmt)]


@router.get("/ext/v1/competitions/{cid}/participants", tags=["external API v1"])
def ext_participants(cid: int, db: DB, _: Annotated[ApiToken, Depends(api_client("results:write"))]):
    apps = db.scalars(select(Application).where(Application.competition_id == cid, Application.status == ApplicationStatus.APPROVED))
    return [{"athlete_id": a.athlete_id, "full_name": a.athlete.full_name, "email": a.athlete.email} for a in apps]


@router.get("/ext/v1/competitions/{cid}/protocol", tags=["external API v1"])
def ext_protocol(cid: int, db: DB, _: Annotated[ApiToken, Depends(api_client("protocols:read"))]):
    c = db.get(Competition, cid)
    if c is None or c.status != CompetitionStatus.COMPLETED:
        raise HTTPException(404, "Протокол не опубликован")
    rows = proto.build_rows(db, c)
    return {"competition": _comp_public(c), "number": c.protocol.number, "published_at": c.protocol.published_at,
            "rows": [{"place": r.place, "athlete_id": r.athlete_id, "full_name": r.full_name, "score": r.score} for r in rows]}


class ImportRow(BaseModel):
    athlete_id: int | None = None
    email: str | None = None
    score: float | None = None
    note: str | None = None


class ImportIn(BaseModel):
    results: list[ImportRow]
    publish: bool = False


@router.post("/ext/v1/competitions/{cid}/results", tags=["external API v1"])
def ext_import_results(
    cid: int, data: ImportIn, db: DB, bg: BackgroundTasks, token: Annotated[ApiToken, Depends(api_client("results:write"))],
):
    c = db.get(Competition, cid)
    if c is None:
        raise HTTPException(404, "Соревнование не найдено")
    if c.status == CompetitionStatus.REGISTRATION_OPEN:
        c.status = CompetitionStatus.REGISTRATION_CLOSED
    if c.status != CompetitionStatus.REGISTRATION_CLOSED:
        raise HTTPException(409, "Протокол уже опубликован или соревнование не открыто")
    approved = {a.athlete_id: a for a in db.scalars(select(Application).where(
        Application.competition_id == cid, Application.status == ApplicationStatus.APPROVED))}
    by_email = {a.athlete.email.lower(): aid for aid, a in approved.items()}
    existing = {r.athlete_id: r for r in c.results}
    errors, imported = [], 0
    for i, row in enumerate(data.results):
        aid = row.athlete_id or by_email.get((row.email or "").lower())
        if aid not in approved:
            errors.append({"row": i, "error": "Нет одобренной заявки у этого участника"})
            continue
        r = existing.get(aid) or Result(competition_id=cid, athlete_id=aid)
        if aid not in existing:
            c.results.append(r)
            existing[aid] = r
        r.score, r.note, r.place_manual = row.score, row.note, False
        imported += 1
    proto.assign_places(c.results)
    log_action(db, None, "import", "results", cid, token=token.name, imported=imported)
    if data.publish and not errors and c.results:
        c.protocol = Protocol(number=f"{c.start_date.year}-{c.id:04d}", published_at=utcnow())
        c.status = CompetitionStatus.COMPLETED
        for r in c.results:
            notify(db, r.athlete_id, "Опубликован протокол", f"«{c.title}»: место {r.place or '-'}", f"/protocols/{c.id}")
        webhooks.emit(db, "protocol.published", {"competition_id": c.id, "title": c.title})
    db.commit()
    bg.add_task(deliver_in_background)
    bg.add_task(webhooks.deliver_pending)
    return {"imported": imported, "errors": errors, "status": c.status.value,
            "protocol": [{"place": r.place, "athlete_id": r.athlete_id, "score": r.score} for r in sorted(c.results, key=lambda r: (r.place is None, r.place or 0))]}

