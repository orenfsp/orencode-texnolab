from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from ..deps import DB, CurrentPrincipal
from ..models import AthleteProfile, Consent, ConsentKind, Discipline, Role, User, UserRole
from ..schemas import LoginIn, MeOut, RegisterIn, SwitchRoleIn, TokenOut
from ..security import create_token, hash_password, verify_password
from ..services.audit import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])

ROLE_PRIORITY = [Role.ADMIN, Role.COACH, Role.JUDGE, Role.ATHLETE, Role.MINISTRY]
CONSENT_VERSION = "2026-01"


def _default_role(user: User) -> Role:
    return next(r for r in ROLE_PRIORITY if r in user.role_set)


def _token_out(user: User, role: Role) -> TokenOut:
    return TokenOut(
        access_token=create_token(user.id, role),
        active_role=role,
        roles=sorted(user.role_set, key=ROLE_PRIORITY.index),
    )


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: DB):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not user or not user.is_active or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    if not user.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "У аккаунта нет ролей")
    return _token_out(user, _default_role(user))


@router.post("/switch-role", response_model=TokenOut)
def switch_role(data: SwitchRoleIn, p: CurrentPrincipal):
    if data.role not in p.user.role_set:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Эта роль не назначена аккаунту")
    return _token_out(p.user, data.role)


@router.get("/me", response_model=MeOut)
def me(p: CurrentPrincipal):
    u = p.user
    return MeOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        roles=sorted(u.role_set, key=ROLE_PRIORITY.index),
        active_role=p.role,
        birth_date=u.birth_date,
    )


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn, db: DB):
    if db.scalar(select(User.id).where(func.lower(User.email) == data.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Аккаунт с таким email уже существует")
    user = User(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        last_name=data.last_name,
        first_name=data.first_name,
        middle_name=data.middle_name,
        birth_date=data.birth_date,
        gender=data.gender,
        municipality_id=data.municipality_id,
        roles=[UserRole(role=Role.ATHLETE)],
    )
    disciplines = db.scalars(select(Discipline).where(Discipline.id.in_(data.discipline_ids))).all()
    user.athlete = AthleteProfile(
        organization_id=data.organization_id,
        start_year=data.start_year,
        guardian_name=data.guardian_name,
        guardian_phone=data.guardian_phone,
        disciplines=list(disciplines),
    )
    db.add(user)
    db.flush()
    db.add(Consent(user_id=user.id, kind=ConsentKind.PD_SELF, signed_by=user.full_name, text_version=CONSENT_VERSION))
    if data.guardian_name:
        db.add(
            Consent(user_id=user.id, kind=ConsentKind.PD_GUARDIAN, signed_by=data.guardian_name, text_version=CONSENT_VERSION)
        )
    log_action(db, None, "register", "user", user.id, email=user.email)
    db.commit()
    return _token_out(user, Role.ATHLETE)
