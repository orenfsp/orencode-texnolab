from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Role, User
from .security import decode_token

DB = Annotated[Session, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False)


@dataclass
class Principal:

    user: User
    role: Role

    @property
    def id(self) -> int:
        return self.user.id


def get_principal(
    db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> Principal:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется авторизация")
    try:
        user_id, role = decode_token(creds.credentials)
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Недействительный токен")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
    if role not in user.role_set:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Роль недоступна для этого аккаунта")
    return Principal(user=user, role=role)


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


def get_optional_principal(
    db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> Principal | None:
    if creds is None:
        return None
    try:
        return get_principal(db, creds)
    except HTTPException:
        return None


OptionalPrincipal = Annotated[Principal | None, Depends(get_optional_principal)]


def require_role(*roles: Role):

    def dep(p: CurrentPrincipal) -> Principal:
        if p.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Действие доступно в кабинете: {', '.join(r.value for r in roles)}",
            )
        return p

    return dep


AdminPrincipal = Annotated[Principal, Depends(require_role(Role.ADMIN))]
ReaderPrincipal = Annotated[Principal, Depends(require_role(Role.ADMIN, Role.MINISTRY))]
AthletePrincipal = Annotated[Principal, Depends(require_role(Role.ATHLETE))]
CoachPrincipal = Annotated[Principal, Depends(require_role(Role.COACH))]
JudgePrincipal = Annotated[Principal, Depends(require_role(Role.JUDGE))]
