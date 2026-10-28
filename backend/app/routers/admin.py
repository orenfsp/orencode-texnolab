
from datetime import date, timedelta

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from ..deps import DB, AdminPrincipal, ReaderPrincipal
from ..models import (
    AgeGroup,
    Application,
    ApplicationStatus,
    AthleteProfile,
    AthleteRank,
    AuditLog,
    CoachAthleteLink,
    CoachProfile,
    Competition,
    CompetitionStatus,
    JudgeCategoryRequest,
    JudgeQualification,
    LinkStatus,
    Organization,
    RankRequest,
    RequestStatus,
    Result,
    Role,
    SportRank,
    User,
    athlete_disciplines,
)

from ..services import evsk

router = APIRouter(prefix="/api/admin", tags=["federation"])

EXPIRY_WINDOW_DAYS = 60


class Kpi(BaseModel):
    athletes: int
    competitions_this_year: int
    participants_this_year: int
    ranks_assigned_this_year: int


class AttentionItem(BaseModel):
    kind: str
    title: str
    detail: str
    link: str
    due: date | None = None


class UpcomingItem(BaseModel):
    id: int
    title: str
    start_date: date
    registration_deadline: date | None
    status: CompetitionStatus


class Dashboard(BaseModel):
    kpi: Kpi
    upcoming: list[UpcomingItem]
    attention: list[AttentionItem]


@router.get("/dashboard", response_model=Dashboard)
def dashboard(db: DB, _: ReaderPrincipal):
    today = date.today()
    year_start = date(today.year, 1, 1)
    soon = today + timedelta(days=EXPIRY_WINDOW_DAYS)

    kpi = Kpi(
        athletes=db.scalar(select(func.count(AthleteProfile.user_id))),
        competitions_this_year=db.scalar(
            select(func.count(Competition.id)).where(
                Competition.start_date >= year_start, Competition.status != CompetitionStatus.CANCELLED
            )
        ),
        participants_this_year=db.scalar(
            select(func.count(func.distinct(Result.athlete_id)))
            .join(Competition, Result.competition_id == Competition.id)
            .where(Competition.start_date >= year_start)
        ),
        ranks_assigned_this_year=db.scalar(
            select(func.count(AthleteRank.id)).where(AthleteRank.assigned_at >= year_start)
        ),
    )

    upcoming = db.scalars(
        select(Competition)
        .where(Competition.end_date >= today, Competition.status != CompetitionStatus.CANCELLED)
        .order_by(Competition.start_date)
        .limit(6)
    ).all()

    attention: list[AttentionItem] = []
    pending_apps = db.execute(
        select(Competition.id, Competition.title, func.count(Application.id))
        .join(Application, Application.competition_id == Competition.id)
        .where(Application.status == ApplicationStatus.SUBMITTED)
        .group_by(Competition.id, Competition.title)
    ).all()
    for cid, title, n in pending_apps:
        attention.append(
            AttentionItem(kind="applications", title="Заявки на модерации", detail=f"{title}: {n}", link=f"/admin/competitions/{cid}")
        )
    n_rank = db.scalar(select(func.count(RankRequest.id)).where(RankRequest.status == RequestStatus.SUBMITTED))
    if n_rank:
        attention.append(AttentionItem(kind="rank_requests", title="Заявки на разряд", detail=str(n_rank), link="/admin/ranks"))
    n_cat = db.scalar(
        select(func.count(JudgeCategoryRequest.id)).where(JudgeCategoryRequest.status == RequestStatus.SUBMITTED)
    )
    if n_cat:
        attention.append(
            AttentionItem(kind="judge_requests", title="Заявки на судейскую категорию", detail=str(n_cat), link="/admin/judges")
        )
    for r in evsk.effective_ranks(db.scalars(select(AthleteRank)).all(), today):
        if not (r.valid_until and today <= r.valid_until <= soon):
            continue
        attention.append(
            AttentionItem(
                kind="rank_expiring",
                title="Истекает разряд",
                detail=f"{r.athlete.full_name} - {r.rank.name}",
                link="/admin/registry",
                due=r.valid_until,
            )
        )
    for q in db.scalars(select(JudgeQualification).where(JudgeQualification.valid_until.between(today, soon))):
        attention.append(
            AttentionItem(
                kind="judge_expiring",
                title="Истекает судейская категория",
                detail=f"{q.judge.full_name} - {q.category.name}",
                link="/admin/judges",
                due=q.valid_until,
            )
        )
    for c in upcoming:
        if c.status == CompetitionStatus.REGISTRATION_OPEN and c.registration_deadline and c.registration_deadline <= soon:
            attention.append(
                AttentionItem(
                    kind="registration_deadline",
                    title="Окончание приёма заявок",
                    detail=c.title,
                    link=f"/admin/competitions/{c.id}",
                    due=c.registration_deadline,
                )
            )
    governor = date(today.year if today.month < 2 else today.year + 1, 2, 1)
    if (governor - today).days <= 90:
        attention.append(
            AttentionItem(kind="report", title="Ходатайства на премии Губернатора", detail="Срок подачи", link="/admin", due=governor)
        )
    attention.sort(key=lambda a: (a.due is None, a.due or today))

    return Dashboard(
        kpi=kpi,
        upcoming=[UpcomingItem.model_validate(c, from_attributes=True) for c in upcoming],
        attention=attention,
    )


class RegistryAthlete(BaseModel):
    id: int
    full_name: str
    birth_date: date | None
    age: int | None
    municipality: str | None
    organization: str | None
    disciplines: list[str]
    start_year: int
    training_stage: str | None
    rank: str | None
    rank_valid_until: date | None
    coaches: list[str]


@router.get("/registry/athletes", response_model=list[RegistryAthlete])
def registry_athletes(
    db: DB,
    _: ReaderPrincipal,
    q: str | None = None,
    discipline_id: int | None = None,
    organization_id: int | None = None,
    municipality_id: int | None = None,
    age_group_id: int | None = None,
    min_rank_id: int | None = None,
    training_stage: str | None = None,
):
    today = date.today()
    stmt = select(AthleteProfile).join(User, AthleteProfile.user_id == User.id).order_by(User.last_name, User.first_name)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.last_name.ilike(like), User.first_name.ilike(like), User.email.ilike(like)))
    if discipline_id:
        stmt = stmt.where(
            AthleteProfile.user_id.in_(
                select(athlete_disciplines.c.athlete_id).where(athlete_disciplines.c.discipline_id == discipline_id)
            )
        )
    if organization_id:
        stmt = stmt.where(AthleteProfile.organization_id == organization_id)
    if municipality_id:
        stmt = stmt.where(User.municipality_id == municipality_id)
    if training_stage:
        stmt = stmt.where(AthleteProfile.training_stage == training_stage)
    age_group = db.get(AgeGroup, age_group_id) if age_group_id else None
    min_rank = db.get(SportRank, min_rank_id) if min_rank_id else None
    out = []
    for a in db.scalars(stmt):
        u = a.user
        age = u.age_in_year(today.year)
        if age_group and (age is None or not age_group.accepts(age)):
            continue
        ranks = [r for r in db.scalars(select(AthleteRank).where(AthleteRank.athlete_id == u.id))
                 if r.valid_until is None or r.valid_until >= today]
        best = max(ranks, key=lambda r: r.rank.level, default=None)
        if min_rank and (best is None or best.rank.level < min_rank.level):
            continue
        coaches = db.scalars(select(CoachAthleteLink).where(
            CoachAthleteLink.athlete_id == u.id, CoachAthleteLink.status == LinkStatus.ACTIVE)).all()
        out.append(
            RegistryAthlete(
                id=u.id,
                full_name=u.full_name,
                birth_date=u.birth_date,
                age=age,
                municipality=u.municipality.name if u.municipality else None,
                organization=(a.organization.short_name or a.organization.name) if a.organization else "без организации",
                disciplines=[d.name for d in a.disciplines],
                start_year=a.start_year,
                training_stage=a.training_stage.value if a.training_stage else None,
                rank=best.rank.name if best else None,
                rank_valid_until=best.valid_until if best else None,
                coaches=sorted({f"{c.coach.full_name} ({c.discipline.name})" for c in coaches}),
            )
        )
    return out


class RegistryCoach(BaseModel):
    id: int
    full_name: str
    organization: str | None
    municipality: str | None
    athletes: int
    disciplines: list[str]
    also_judge: bool


@router.get("/registry/coaches", response_model=list[RegistryCoach])
def registry_coaches(db: DB, _: ReaderPrincipal, q: str | None = None):
    stmt = select(CoachProfile).join(User, CoachProfile.user_id == User.id).order_by(User.last_name)
    if q:
        stmt = stmt.where(User.last_name.ilike(f"%{q}%"))
    out = []
    for c in db.scalars(stmt):
        links = db.scalars(select(CoachAthleteLink).where(
            CoachAthleteLink.coach_id == c.user_id, CoachAthleteLink.status == LinkStatus.ACTIVE)).all()
        out.append(RegistryCoach(
            id=c.user_id, full_name=c.user.full_name,
            organization=(c.organization.short_name or c.organization.name) if c.organization else None,
            municipality=c.user.municipality.name if c.user.municipality else None,
            athletes=len({l.athlete_id for l in links}), disciplines=sorted({l.discipline.name for l in links}),
            also_judge=Role.JUDGE in c.user.role_set,
        ))
    return out


class RegistryOrg(BaseModel):
    id: int
    name: str
    short_name: str | None
    type: str
    municipality: str
    conducts_sport_training: bool
    license_number: str | None
    athletes: int
    coaches: int


@router.get("/registry/organizations", response_model=list[RegistryOrg])
def registry_orgs(db: DB, _: ReaderPrincipal):
    out = []
    for o in db.scalars(select(Organization).order_by(Organization.name)):
        out.append(RegistryOrg(
            id=o.id, name=o.name, short_name=o.short_name, type=o.type.value, municipality=o.municipality.name,
            conducts_sport_training=o.conducts_sport_training, license_number=o.license_number,
            athletes=db.scalar(select(func.count()).select_from(AthleteProfile).where(AthleteProfile.organization_id == o.id)),
            coaches=db.scalar(select(func.count()).select_from(CoachProfile).where(CoachProfile.organization_id == o.id)),
        ))
    return out


class AuditOut(BaseModel):
    id: int
    at: str
    user: str | None
    role: str | None
    action: str
    entity: str
    entity_id: int | None
    details: dict | None


@router.get("/audit", response_model=list[AuditOut])
def audit_log(db: DB, _: AdminPrincipal, limit: int = 100):
    rows = db.execute(
        select(AuditLog, User).outerjoin(User, AuditLog.user_id == User.id).order_by(AuditLog.id.desc()).limit(limit)
    ).all()
    return [
        AuditOut(
            id=a.id,
            at=a.at.isoformat(),
            user=u.full_name if u else None,
            role=a.role.value if a.role else None,
            action=a.action,
            entity=a.entity,
            entity_id=a.entity_id,
            details=a.details,
        )
        for a, u in rows
    ]
