
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select

from ..deps import DB, AdminPrincipal, CurrentPrincipal, ReaderPrincipal
from ..models import (
    Discipline,
    Disqualification,
    NationalTeam,
    RatingLevel,
    RatingPointRule,
    Setting,
    TeamMember,
    TeamMemberRole,
    TeamStatus,
    User,
)
from ..services import documents as docs
from ..services import rating as rating_svc
from ..services.audit import log_action
from ..services.notifications import notify

router = APIRouter(prefix="/api", tags=["rating"])


class EntryOut(BaseModel):
    competition_id: int
    title: str
    date: date
    level: str
    place: int | None
    points: float


class RatingRowOut(BaseModel):
    position: int
    athlete_id: int
    full_name: str
    birth_year: int | None
    organization: str | None
    rank: str | None
    entries: list[EntryOut]
    base: float
    podiums: int
    coefficient: float
    total: float
    excluded_reason: str | None


class RatingOut(BaseModel):
    discipline: str
    season: int
    rules: str
    rows: list[RatingRowOut]
    excluded: list[RatingRowOut]


def _row(r: rating_svc.RatingRow) -> RatingRowOut:
    return RatingRowOut(
        position=r.position, athlete_id=r.athlete_id, full_name=r.full_name, birth_year=r.birth_year,
        organization=r.organization, rank=r.rank, entries=[EntryOut(**e.__dict__) for e in r.entries],
        base=r.base, podiums=r.podiums, coefficient=r.coefficient, total=r.total, excluded_reason=r.excluded_reason,
    )


@router.get("/rating", response_model=RatingOut)
def get_rating(
    db: DB, _: CurrentPrincipal, discipline_id: int, season: int | None = None,
    age_group_id: int | None = None, min_rank_id: int | None = None,
):
    season = season or date.today().year
    disc = db.get(Discipline, discipline_id)
    if disc is None:
        raise HTTPException(404, "Дисциплина не найдена")
    rows, excluded = rating_svc.compute(db, discipline_id, season, age_group_id, min_rank_id)
    _, coef, min_pod = rating_svc.rating_settings(db)
    return RatingOut(
        discipline=disc.name, season=season,
        rules=f"Сумма баллов за места сезона; ×{coef} при {min_pod}+ призовых местах; дисквалифицированные исключаются",
        rows=[_row(r) for r in rows], excluded=[_row(r) for r in excluded],
    )




class RuleIO(BaseModel):
    rating_level: RatingLevel
    place: int
    points: float


class RatingSettingsIO(BaseModel):
    rules: list[RuleIO]
    stability_coefficient: float
    stability_min_podiums: int


@router.get("/admin/settings/rating", response_model=RatingSettingsIO)
def get_rating_settings(db: DB, _: ReaderPrincipal):
    rules, coef, min_pod = rating_svc.rating_settings(db)
    return RatingSettingsIO(
        rules=[RuleIO(rating_level=l, place=p, points=v) for (l, p), v in sorted(rules.items(), key=lambda x: (x[0][0].value, x[0][1]))],
        stability_coefficient=coef, stability_min_podiums=min_pod,
    )


@router.put("/admin/settings/rating", response_model=RatingSettingsIO)
def set_rating_settings(data: RatingSettingsIO, db: DB, p: AdminPrincipal):
    if data.stability_coefficient < 1 or data.stability_min_podiums < 1:
        raise HTTPException(422, "Коэффициент ≥ 1, минимум призовых мест ≥ 1")
    db.execute(delete(RatingPointRule))
    for r in data.rules:
        db.add(RatingPointRule(rating_level=r.rating_level, place=r.place, points=r.points))
    for key, val in (("stability_coefficient", data.stability_coefficient), ("stability_min_podiums", data.stability_min_podiums)):
        s = db.get(Setting, key) or Setting(key=key)
        s.value = val
        db.add(s)
    log_action(db, p, "update", "rating_settings", None, coefficient=data.stability_coefficient)
    db.commit()
    return get_rating_settings(db, p)




class DisqIn(BaseModel):
    athlete_id: int
    date_from: date
    date_to: date | None = None
    reason: str


class DisqOut(DisqIn):
    id: int
    athlete_name: str
    active: bool


@router.get("/admin/disqualifications", response_model=list[DisqOut])
def list_disq(db: DB, _: ReaderPrincipal):
    today = date.today()
    return [
        DisqOut(id=d.id, athlete_id=d.athlete_id, athlete_name=db.get(User, d.athlete_id).full_name, date_from=d.date_from,
                date_to=d.date_to, reason=d.reason, active=d.is_active_on(today))
        for d in db.scalars(select(Disqualification).order_by(Disqualification.date_from.desc()))
    ]


@router.post("/admin/disqualifications", response_model=list[DisqOut], status_code=201)
def add_disq(data: DisqIn, db: DB, p: AdminPrincipal):
    if db.get(User, data.athlete_id) is None:
        raise HTTPException(404, "Спортсмен не найден")
    db.add(Disqualification(**data.model_dump()))
    log_action(db, p, "create", "disqualification", data.athlete_id, reason=data.reason)
    notify(db, data.athlete_id, "Дисквалификация", data.reason, None)
    db.commit()
    return list_disq(db, p)




class TeamIn(BaseModel):
    discipline_id: int
    season: int
    age_group_id: int | None = None
    title: str | None = None


class MemberOut(BaseModel):
    athlete_id: int
    full_name: str
    birth_year: int | None
    organization: str | None
    rank: str | None
    role: TeamMemberRole
    rating_points: float | None


class TeamOut(BaseModel):
    id: int
    title: str
    discipline_id: int
    discipline: str
    season: int
    age_group_id: int | None
    age_group: str | None
    status: TeamStatus
    order_number: str | None
    order_date: date | None
    members: list[MemberOut]


def team_out(db: DB, t: NationalTeam) -> TeamOut:
    members = []
    for m in t.members:
        u = m.athlete
        prof = u.athlete
        cur = rating_svc.evsk.current_rank(db, u.id, t.discipline_id)
        members.append(MemberOut(
            athlete_id=u.id, full_name=u.full_name, birth_year=u.birth_date.year if u.birth_date else None,
            organization=(prof.organization.short_name or prof.organization.name) if prof and prof.organization else None,
            rank=cur.rank.name if cur else None, role=m.role, rating_points=m.rating_points,
        ))
    return TeamOut(
        id=t.id, title=t.title, discipline_id=t.discipline_id, discipline=t.discipline.name, season=t.season,
        age_group_id=t.age_group_id, age_group=t.age_group.name if t.age_group else None, status=t.status,
        order_number=t.order_number, order_date=t.order_date, members=members,
    )


def _team(db: DB, team_id: int) -> NationalTeam:
    t = db.get(NationalTeam, team_id)
    if t is None:
        raise HTTPException(404, "Сборная не найдена")
    return t


@router.get("/teams", response_model=list[TeamOut])
def list_teams(db: DB, _: CurrentPrincipal):
    return [team_out(db, t) for t in db.scalars(select(NationalTeam).order_by(NationalTeam.season.desc(), NationalTeam.id.desc()))]


@router.get("/teams/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: DB, _: CurrentPrincipal):
    return team_out(db, _team(db, team_id))


@router.post("/teams", response_model=TeamOut, status_code=201)
def create_team(data: TeamIn, db: DB, p: AdminPrincipal):
    disc = db.get(Discipline, data.discipline_id)
    if disc is None:
        raise HTTPException(422, "Неизвестная дисциплина")
    t = NationalTeam(
        discipline_id=disc.id, season=data.season, age_group_id=data.age_group_id,
        title=data.title or f"Сборная Оренбургской области по дисциплине «{disc.name}», сезон {data.season}",
    )
    db.add(t)
    db.flush()
    log_action(db, p, "create", "national_team", t.id)
    db.commit()
    return team_out(db, t)


class MemberIn(BaseModel):
    athlete_id: int
    role: TeamMemberRole = TeamMemberRole.MAIN


@router.put("/teams/{team_id}/members", response_model=TeamOut)
def set_members(team_id: int, members: list[MemberIn], db: DB, p: AdminPrincipal):
    t = _team(db, team_id)
    if t.status == TeamStatus.APPROVED:
        raise HTTPException(409, "Состав утверждён приказом")
    rows, _ = rating_svc.compute(db, t.discipline_id, t.season, t.age_group_id)
    points = {r.athlete_id: r.total for r in rows}
    t.members.clear()
    db.flush()
    for i, m in enumerate(members):
        if db.get(User, m.athlete_id) is None:
            raise HTTPException(422, f"Спортсмен {m.athlete_id} не найден")
        t.members.append(TeamMember(athlete_id=m.athlete_id, role=m.role, position=i, rating_points=points.get(m.athlete_id)))
    log_action(db, p, "update", "national_team", t.id, members=len(members))
    db.commit()
    db.refresh(t)
    return team_out(db, t)


class ApproveIn(BaseModel):
    order_number: str
    order_date: date


@router.post("/teams/{team_id}/approve", response_model=TeamOut)
def approve_team(team_id: int, data: ApproveIn, db: DB, p: AdminPrincipal):
    t = _team(db, team_id)
    if not t.members:
        raise HTTPException(409, "Состав пуст")
    t.status = TeamStatus.APPROVED
    t.order_number, t.order_date = data.order_number, data.order_date
    for m in t.members:
        role = "основной состав" if m.role == TeamMemberRole.MAIN else "резерв"
        notify(db, m.athlete_id, "Вы включены в сборную области", f"{t.title} ({role})", "/athlete/results")
    log_action(db, p, "status", "national_team", t.id, order=data.order_number)
    db.commit()
    return team_out(db, t)


ROLE_RU = {TeamMemberRole.MAIN: "Основной состав", TeamMemberRole.RESERVE: "Резерв"}


@router.get("/teams/{team_id}/list.{fmt}")
def team_list(team_id: int, fmt: str, db: DB, _: ReaderPrincipal):
    t = team_out(db, _team(db, team_id))
    cols = ["№", "ФИО", "Год рождения", "Организация", "Разряд", "Состав", "Рейтинговый балл"]
    rows = [(i, m.full_name, m.birth_year, m.organization or "-", m.rank or "б/р", ROLE_RU[m.role], m.rating_points)
            for i, m in enumerate(t.members, 1)]
    if fmt == "xlsx":
        return docs.file_response(docs.xlsx_bytes({"Сборная": (cols, rows)}, t.title), f"team_{t.id}.xlsx")
    if fmt != "docx":
        raise HTTPException(404, "Поддерживаются xlsx и docx")
    doc = docs.new_doc("СПИСОК спортивной сборной команды Оренбургской области",
                       [t.title] + ([f"Возрастная группа: {t.age_group}"] if t.age_group else []))
    docs.add_table(doc, cols, rows)
    docs.signature(doc, "Председатель регионального отделения")
    return docs.file_response(docs.docx_bytes(doc), f"team_{t.id}.docx")


@router.get("/teams/{team_id}/order.docx")
def team_order(team_id: int, db: DB, _: ReaderPrincipal):
    t = team_out(db, _team(db, team_id))
    doc = docs.new_doc("ПРОЕКТ ПРИКАЗА", [
        f"№ {t.order_number or '____'} от {t.order_date:%d.%m.%Y}" if t.order_date else "№ ____ от «___» ________ 20__ г.",
        "",
        f"Об утверждении состава спортивной сборной команды Оренбургской области по виду спорта "
        f"«спортивное программирование» (дисциплина «{t.discipline}») на {t.season} год",
        "",
        "В соответствии с Федеральным законом от 04.12.2007 № 329-ФЗ «О физической культуре и спорте в Российской "
        "Федерации», на основании рейтинга спортсменов Оренбургской области за сезон, ПРИКАЗЫВАЮ:",
        "1. Утвердить состав спортивной сборной команды Оренбургской области согласно приложению.",
        "2. Контроль за исполнением настоящего приказа оставляю за собой.",
        "",
        "Приложение: список спортсменов.",
    ])
    docs.add_table(doc, ["№", "ФИО", "Год рождения", "Организация", "Состав"],
                   [(i, m.full_name, m.birth_year, m.organization or "-", ROLE_RU[m.role]) for i, m in enumerate(t.members, 1)])
    docs.signature(doc, "Министр физической культуры и спорта Оренбургской области")
    return docs.file_response(docs.docx_bytes(doc), f"team_order_{t.id}.docx")
