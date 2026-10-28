
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import DB, AdminPrincipal, CurrentPrincipal, Principal
from ..models import (
    Attestation,
    CoachAthleteLink,
    CoachProfile,
    CompetitionFormat,
    Gender,
    GroupMember,
    LinkStatus,
    Municipality,
    NormDirection,
    NormKind,
    NormResult,
    NormStandard,
    Organization,
    OrgProgram,
    OrgType,
    Role,
    TrainingGroup,
    TrainingSession,
    TrainingStage,
    User,
)
from ..services.audit import log_action
from ..services.notifications import notify

router = APIRouter(prefix="/api", tags=["training"])

STAGES = [TrainingStage.NP, TrainingStage.UTE, TrainingStage.SSM, TrainingStage.VSM]
STAGE_RU = {"np": "НП", "ute": "УТЭ", "ssm": "ССМ", "vsm": "ВСМ"}


def _staff(p: Principal) -> None:
    if p.role not in (Role.ADMIN, Role.COACH):
        raise HTTPException(403, "Доступно федерации и тренерам")


def _coach_has(db: DB, coach_id: int, athlete_id: int) -> bool:
    return bool(db.scalar(select(CoachAthleteLink.id).where(
        CoachAthleteLink.coach_id == coach_id, CoachAthleteLink.athlete_id == athlete_id,
        CoachAthleteLink.status == LinkStatus.ACTIVE)))




class ProgramIO(BaseModel):
    discipline_id: int
    stage: TrainingStage


class OrgIn(BaseModel):
    name: str
    short_name: str | None = None
    type: OrgType
    municipality_id: int
    conducts_sport_training: bool = False
    license_number: str | None = None
    license_date: date | None = None
    address: str | None = None
    programs: list[ProgramIO] = []


def org_card(db: DB, o: Organization) -> dict:
    coaches = db.scalars(select(CoachProfile).where(CoachProfile.organization_id == o.id)).all()
    groups = db.scalars(select(TrainingGroup).where(TrainingGroup.organization_id == o.id)).all()
    return {
        "id": o.id, "name": o.name, "short_name": o.short_name, "type": o.type.value,
        "municipality_id": o.municipality_id, "municipality": o.municipality.name,
        "conducts_sport_training": o.conducts_sport_training, "license_number": o.license_number,
        "license_date": o.license_date, "address": o.address,
        "programs": [{"discipline_id": p.discipline_id, "discipline": p.discipline.name, "stage": p.stage.value} for p in o.programs],
        "coaches": [{"id": c.user_id, "full_name": c.user.full_name} for c in coaches],
        "groups": [
            {"id": g.id, "name": g.name, "discipline": g.discipline.name, "stage": g.stage.value, "coach": g.coach.full_name,
             "members": sum(1 for m in g.members if m.left_at is None)}
            for g in groups
        ],
    }


@router.get("/organizations/{org_id}")
def get_org(org_id: int, db: DB, _: CurrentPrincipal):
    o = db.get(Organization, org_id)
    if o is None:
        raise HTTPException(404, "Организация не найдена")
    return org_card(db, o)


def _apply_org(db: DB, o: Organization, data: OrgIn) -> None:
    if db.get(Municipality, data.municipality_id) is None:
        raise HTTPException(422, "Неизвестный муниципалитет")
    for f in ("name", "short_name", "type", "municipality_id", "conducts_sport_training", "license_number", "license_date", "address"):
        setattr(o, f, getattr(data, f))
    o.programs = [OrgProgram(discipline_id=p.discipline_id, stage=p.stage) for p in {(p.discipline_id, p.stage): p for p in data.programs}.values()]


@router.post("/admin/organizations", status_code=201)
def create_org(data: OrgIn, db: DB, p: AdminPrincipal):
    o = Organization()
    _apply_org(db, o, data)
    db.add(o)
    db.flush()
    log_action(db, p, "create", "organization", o.id, name=o.name)
    db.commit()
    return org_card(db, o)


@router.put("/admin/organizations/{org_id}")
def update_org(org_id: int, data: OrgIn, db: DB, p: AdminPrincipal):
    o = db.get(Organization, org_id)
    if o is None:
        raise HTTPException(404, "Организация не найдена")
    o.programs.clear()
    db.flush()
    _apply_org(db, o, data)
    log_action(db, p, "update", "organization", o.id)
    db.commit()
    return org_card(db, o)




class GroupIn(BaseModel):
    organization_id: int
    discipline_id: int
    stage: TrainingStage
    name: str
    year: int
    coach_id: int | None = None


def group_out(db: DB, g: TrainingGroup, detailed: bool = False) -> dict:
    active = [m for m in g.members if m.left_at is None]
    out = {
        "id": g.id, "name": g.name, "organization_id": g.organization_id, "organization": g.organization.short_name or g.organization.name,
        "discipline_id": g.discipline_id, "discipline": g.discipline.name, "stage": g.stage.value, "year": g.year,
        "coach_id": g.coach_id, "coach": g.coach.full_name, "members_count": len(active),
    }
    if detailed:
        out["members"] = [
            {"athlete_id": m.athlete_id, "full_name": m.athlete.full_name,
             "birth_year": m.athlete.birth_date.year if m.athlete.birth_date else None,
             "gender": m.athlete.gender.value if m.athlete.gender else None, "enrolled_at": m.enrolled_at}
            for m in active
        ]
        out["history"] = [
            {"athlete": m.athlete.full_name, "enrolled_at": m.enrolled_at, "left_at": m.left_at, "reason": m.reason}
            for m in sorted(g.members, key=lambda m: m.enrolled_at) if m.left_at
        ]
        sessions = db.scalars(select(TrainingSession).where(TrainingSession.group_id == g.id).order_by(TrainingSession.held_on.desc())).all()
        out["sessions"] = [
            {"id": s.id, "held_on": s.held_on, "format": s.format.value, "topic": s.topic, "hours": s.hours,
             "confirmation_url": s.confirmation_url, "attendees": len(s.attendees)}
            for s in sessions
        ]
    return out


def _group(db: DB, gid: int, p: Principal) -> TrainingGroup:
    g = db.get(TrainingGroup, gid)
    if g is None:
        raise HTTPException(404, "Группа не найдена")
    if p.role == Role.COACH and g.coach_id != p.id:
        raise HTTPException(403, "Это группа другого тренера")
    if p.role not in (Role.ADMIN, Role.COACH, Role.MINISTRY):
        raise HTTPException(403, "Нет доступа")
    return g


@router.get("/groups")
def list_groups(db: DB, p: CurrentPrincipal, organization_id: int | None = None):
    stmt = select(TrainingGroup).order_by(TrainingGroup.name)
    if p.role == Role.COACH:
        stmt = stmt.where(TrainingGroup.coach_id == p.id)
    elif p.role not in (Role.ADMIN, Role.MINISTRY):
        raise HTTPException(403, "Нет доступа")
    if organization_id:
        stmt = stmt.where(TrainingGroup.organization_id == organization_id)
    return [group_out(db, g) for g in db.scalars(stmt)]


@router.get("/groups/{gid}")
def get_group(gid: int, db: DB, p: CurrentPrincipal):
    return group_out(db, _group(db, gid, p), detailed=True)


@router.post("/groups", status_code=201)
def create_group(data: GroupIn, db: DB, p: CurrentPrincipal):
    _staff(p)
    coach_id = p.id if p.role == Role.COACH else data.coach_id
    coach = db.get(User, coach_id) if coach_id else None
    if coach is None or Role.COACH not in coach.role_set:
        raise HTTPException(422, "Укажите тренера группы")
    org = db.get(Organization, data.organization_id)
    if org is None:
        raise HTTPException(422, "Неизвестная организация")
    g = TrainingGroup(organization_id=org.id, discipline_id=data.discipline_id, stage=data.stage, coach_id=coach.id,
                      name=data.name, year=data.year)
    db.add(g)
    db.flush()
    log_action(db, p, "create", "training_group", g.id)
    db.commit()
    return group_out(db, g, True)


class EnrollIn(BaseModel):
    athlete_id: int
    enrolled_at: date | None = None


@router.post("/groups/{gid}/members")
def enroll(gid: int, data: EnrollIn, db: DB, p: CurrentPrincipal):
    g = _group(db, gid, p)
    _staff(p)
    athlete = db.get(User, data.athlete_id)
    if athlete is None or athlete.athlete is None:
        raise HTTPException(422, "Спортсмен не найден")
    if p.role == Role.COACH and not _coach_has(db, p.id, athlete.id):
        raise HTTPException(403, "Спортсмен не привязан к вам")
    if any(m.athlete_id == athlete.id and m.left_at is None for m in g.members):
        raise HTTPException(409, "Спортсмен уже в группе")
    g.members.append(GroupMember(athlete_id=athlete.id, enrolled_at=data.enrolled_at or date.today(), reason="Зачисление"))
    athlete.athlete.training_stage = g.stage
    if athlete.athlete.organization_id is None:
        athlete.athlete.organization_id = g.organization_id
    log_action(db, p, "create", "group_member", g.id, athlete_id=athlete.id)
    notify(db, athlete.id, "Зачисление в группу", f"{g.name} ({g.organization.short_name or g.organization.name})", None)
    db.commit()
    return group_out(db, g, True)


class TransferIn(BaseModel):
    to_group_id: int | None = None
    reason: str


@router.post("/groups/{gid}/members/{athlete_id}/transfer")
def transfer(gid: int, athlete_id: int, data: TransferIn, db: DB, p: CurrentPrincipal):
    g = _group(db, gid, p)
    _staff(p)
    m = next((m for m in g.members if m.athlete_id == athlete_id and m.left_at is None), None)
    if m is None:
        raise HTTPException(404, "Спортсмен не числится в группе")
    m.left_at = date.today()
    m.reason = data.reason
    if data.to_group_id:
        to = db.get(TrainingGroup, data.to_group_id)
        if to is None:
            raise HTTPException(422, "Группа назначения не найдена")
        to.members.append(GroupMember(athlete_id=athlete_id, enrolled_at=date.today(), reason=f"Перевод из «{g.name}»"))
        m.athlete.athlete.training_stage = to.stage
    log_action(db, p, "transfer", "group_member", g.id, athlete_id=athlete_id, to=data.to_group_id)
    db.commit()
    return group_out(db, g, True)


class SessionIn(BaseModel):
    held_on: date
    format: CompetitionFormat
    topic: str
    hours: float = Field(2, gt=0, le=12)
    confirmation_url: str | None = None
    attendee_ids: list[int] = []


@router.post("/groups/{gid}/sessions", status_code=201)
def add_session(gid: int, data: SessionIn, db: DB, p: CurrentPrincipal):
    g = _group(db, gid, p)
    _staff(p)
    if data.format != CompetitionFormat.OFFLINE and not data.confirmation_url:
        raise HTTPException(422, "Для онлайн-занятия нужна ссылка на запись или лог платформы")
    if data.held_on > date.today():
        raise HTTPException(422, "Занятие ещё не проведено")
    member_ids = {m.athlete_id for m in g.members if m.left_at is None}
    s = TrainingSession(group_id=g.id, held_on=data.held_on, format=data.format, topic=data.topic, hours=data.hours,
                        confirmation_url=data.confirmation_url, created_by_id=p.id)
    s.attendees = list(db.scalars(select(User).where(User.id.in_(set(data.attendee_ids) & member_ids))))
    db.add(s)
    log_action(db, p, "create", "training_session", g.id, topic=data.topic)
    db.commit()
    return group_out(db, g, True)




class StandardIO(BaseModel):
    name: str
    kind: NormKind
    stage: TrainingStage
    discipline_id: int | None = None
    gender: Gender | None = None
    threshold: float
    unit: str
    direction: NormDirection


def standard_out(s: NormStandard) -> dict:
    return {"id": s.id, "name": s.name, "kind": s.kind.value, "stage": s.stage.value, "discipline_id": s.discipline_id,
            "discipline": s.discipline.name if s.discipline else "Все дисциплины", "gender": s.gender.value if s.gender else None,
            "threshold": s.threshold, "unit": s.unit, "direction": s.direction.value}


@router.get("/norms/standards")
def list_standards(db: DB, _: CurrentPrincipal, stage: TrainingStage | None = None):
    stmt = select(NormStandard).order_by(NormStandard.stage, NormStandard.kind, NormStandard.name)
    if stage:
        stmt = stmt.where(NormStandard.stage == stage)
    return [standard_out(s) for s in db.scalars(stmt)]


@router.post("/norms/standards", status_code=201)
def add_standard(data: StandardIO, db: DB, p: AdminPrincipal):
    s = NormStandard(**data.model_dump())
    db.add(s)
    db.flush()
    log_action(db, p, "create", "norm_standard", s.id)
    db.commit()
    return standard_out(s)


@router.put("/norms/standards/{sid}")
def update_standard(sid: int, data: StandardIO, db: DB, p: AdminPrincipal):
    s = db.get(NormStandard, sid)
    if s is None:
        raise HTTPException(404, "Норматив не найден")
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    log_action(db, p, "update", "norm_standard", s.id)
    db.commit()
    return standard_out(s)


def _applicable(db: DB, athlete: User, stage: TrainingStage) -> list[NormStandard]:
    disc_ids = {d.id for d in athlete.athlete.disciplines} if athlete.athlete else set()
    return [
        s for s in db.scalars(select(NormStandard).where(NormStandard.stage == stage))
        if (s.discipline_id is None or s.discipline_id in disc_ids) and (s.gender is None or s.gender == athlete.gender)
    ]


class NormResultIn(BaseModel):
    athlete_id: int
    standard_id: int
    value: float
    taken_on: date | None = None


def _can_record(db: DB, p: Principal, athlete_id: int) -> None:
    if p.role == Role.ADMIN or (p.role == Role.COACH and _coach_has(db, p.id, athlete_id)):
        return
    raise HTTPException(403, "Результаты вносит тренер спортсмена или федерация")


@router.post("/norms/results", status_code=201)
def record_norm(data: NormResultIn, db: DB, p: CurrentPrincipal):
    _can_record(db, p, data.athlete_id)
    s = db.get(NormStandard, data.standard_id)
    if s is None:
        raise HTTPException(422, "Норматив не найден")
    r = NormResult(athlete_id=data.athlete_id, standard_id=s.id, value=data.value, passed=s.is_passed(data.value),
                   taken_on=data.taken_on or date.today(), recorded_by_id=p.id)
    db.add(r)
    log_action(db, p, "create", "norm_result", data.athlete_id, standard=s.name, value=data.value, passed=r.passed)
    db.commit()
    return {"id": r.id, "passed": r.passed, "standard": standard_out(s), "value": r.value}


def readiness(db: DB, athlete: User) -> dict:
    stage = athlete.athlete.training_stage if athlete.athlete else None
    nxt = STAGES[STAGES.index(stage) + 1] if stage and stage != STAGES[-1] else None
    results = db.scalars(select(NormResult).where(NormResult.athlete_id == athlete.id).order_by(NormResult.taken_on)).all()
    latest = {r.standard_id: r for r in results}
    required = _applicable(db, athlete, stage) if stage else []
    items = [
        {"standard": standard_out(s), "value": latest[s.id].value if s.id in latest else None,
         "passed": latest[s.id].passed if s.id in latest else False,
         "taken_on": latest[s.id].taken_on if s.id in latest else None}
        for s in required
    ]
    return {
        "athlete_id": athlete.id, "full_name": athlete.full_name, "stage": stage.value if stage else None, "next_stage": nxt.value if nxt else None,
        "requirements": items, "ready": bool(nxt and items and all(i["passed"] for i in items)),
        "history": [{"standard": r.standard.name, "value": r.value, "unit": r.standard.unit, "passed": r.passed, "taken_on": r.taken_on} for r in reversed(results)],
        "attestations": [
            {"from_stage": a.from_stage.value if a.from_stage else None, "to_stage": a.to_stage.value, "decided_on": a.decided_on, "comment": a.comment}
            for a in db.scalars(select(Attestation).where(Attestation.athlete_id == athlete.id).order_by(Attestation.decided_on))
        ],
    }


@router.get("/athletes/{athlete_id}/norms")
def athlete_norms(athlete_id: int, db: DB, p: CurrentPrincipal):
    if p.id != athlete_id and p.role not in (Role.ADMIN, Role.MINISTRY) and not (p.role == Role.COACH and _coach_has(db, p.id, athlete_id)):
        raise HTTPException(403, "Нет доступа")
    athlete = db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(404, "Спортсмен не найден")
    return readiness(db, athlete)


@router.get("/norms/readiness")
def group_readiness(db: DB, p: CurrentPrincipal, group_id: int | None = None):
    _staff(p)
    if group_id:
        g = _group(db, group_id, p)
        ids = [m.athlete_id for m in g.members if m.left_at is None]
    elif p.role == Role.COACH:
        ids = list({l.athlete_id for l in db.scalars(select(CoachAthleteLink).where(
            CoachAthleteLink.coach_id == p.id, CoachAthleteLink.status == LinkStatus.ACTIVE))})
    else:
        ids = list(db.scalars(select(GroupMember.athlete_id).where(GroupMember.left_at.is_(None))).unique())
    return [readiness(db, db.get(User, i)) for i in ids]


class AttestationIn(BaseModel):
    athlete_id: int
    comment: str | None = None
    to_group_id: int | None = None


@router.post("/attestations", status_code=201)
def attest(data: AttestationIn, db: DB, p: CurrentPrincipal):
    _can_record(db, p, data.athlete_id)
    athlete = db.get(User, data.athlete_id)
    r = readiness(db, athlete)
    if not r["next_stage"]:
        raise HTTPException(409, "Спортсмен на последнем этапе или этап не задан")
    if not r["ready"]:
        raise HTTPException(409, "Не все нормативы этапа выполнены")
    to_stage = TrainingStage(r["next_stage"])
    a = Attestation(athlete_id=athlete.id, from_stage=athlete.athlete.training_stage, to_stage=to_stage,
                    decided_on=date.today(), decided_by_id=p.id, comment=data.comment)
    db.add(a)
    athlete.athlete.training_stage = to_stage
    if data.to_group_id:
        current = db.scalar(select(GroupMember).where(GroupMember.athlete_id == athlete.id, GroupMember.left_at.is_(None)))
        if current:
            current.left_at, current.reason = date.today(), f"Перевод на этап {STAGE_RU[to_stage.value]}"
        to = db.get(TrainingGroup, data.to_group_id)
        if to:
            to.members.append(GroupMember(athlete_id=athlete.id, enrolled_at=date.today(), reason="Перевод по итогам аттестации"))
    notify(db, athlete.id, "Перевод на следующий этап", f"Этап подготовки: {STAGE_RU[to_stage.value]}", "/athlete/path")
    log_action(db, p, "create", "attestation", athlete.id, to=to_stage.value)
    db.commit()
    return readiness(db, athlete)
