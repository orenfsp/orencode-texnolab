
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    AgeGroup,
    Competition,
    CompetitionStatus,
    Disqualification,
    RatingLevel,
    RatingPointRule,
    Setting,
    SportRank,
    User,
)
from . import evsk

LEVEL_RU = {
    RatingLevel.RUS_CHAMPIONSHIP: "Чемпионат России",
    RatingLevel.RUS_YOUTH: "Первенство России",
    RatingLevel.INTERREGIONAL: "Межрегиональные",
    RatingLevel.REGIONAL: "Региональные",
    RatingLevel.NONE: "Не учитывается",
}


@dataclass
class Entry:
    competition_id: int
    title: str
    date: date
    level: str
    place: int | None
    points: float


@dataclass
class RatingRow:
    athlete_id: int
    full_name: str
    birth_year: int | None
    organization: str | None
    rank: str | None
    entries: list[Entry] = field(default_factory=list)
    base: float = 0
    podiums: int = 0
    coefficient: float = 1.0
    total: float = 0
    position: int = 0
    excluded_reason: str | None = None


def rating_settings(db: Session) -> tuple[dict[tuple[RatingLevel, int], float], float, int]:
    rules = {(r.rating_level, r.place): r.points for r in db.scalars(select(RatingPointRule))}
    coef = db.get(Setting, "stability_coefficient")
    min_pod = db.get(Setting, "stability_min_podiums")
    return rules, float(coef.value) if coef else 1.2, int(min_pod.value) if min_pod else 2


def compute(
    db: Session,
    discipline_id: int,
    season: int,
    age_group_id: int | None = None,
    min_rank_id: int | None = None,
) -> tuple[list[RatingRow], list[RatingRow]]:
    rules, coefficient, min_podiums = rating_settings(db)
    comps = db.scalars(
        select(Competition).where(
            Competition.discipline_id == discipline_id,
            Competition.status == CompetitionStatus.COMPLETED,
            Competition.start_date.between(date(season, 1, 1), date(season, 12, 31)),
            Competition.rating_level != RatingLevel.NONE,
        ).order_by(Competition.start_date)
    ).all()
    age_group = db.get(AgeGroup, age_group_id) if age_group_id else None
    min_rank = db.get(SportRank, min_rank_id) if min_rank_id else None
    check_on = min(date.today(), date(season, 12, 31))

    rows: dict[int, RatingRow] = {}
    for comp in comps:
        for res in comp.results:
            if res.place is None:
                continue
            row = rows.get(res.athlete_id)
            if row is None:
                u: User = res.athlete
                prof = u.athlete
                cur = evsk.current_rank(db, u.id, discipline_id, check_on)
                row = rows[u.id] = RatingRow(
                    athlete_id=u.id, full_name=u.full_name, birth_year=u.birth_date.year if u.birth_date else None,
                    organization=(prof.organization.short_name or prof.organization.name) if prof and prof.organization else None,
                    rank=cur.rank.name if cur else None,
                )
            pts = rules.get((comp.rating_level, res.place), 0)
            row.entries.append(Entry(comp.id, comp.title, comp.start_date, LEVEL_RU[comp.rating_level], res.place, pts))
            row.base += pts
            row.podiums += res.place <= 3

    included, excluded = [], []
    for row in rows.values():
        u = db.get(User, row.athlete_id)
        if age_group and (u.birth_date is None or not age_group.accepts(season - u.birth_date.year)):
            continue
        if min_rank:
            cur = evsk.current_rank(db, u.id, discipline_id, check_on)
            if cur is None or cur.rank.level < min_rank.level:
                continue
        row.coefficient = coefficient if row.podiums >= min_podiums else 1.0
        row.total = round(row.base * row.coefficient, 2)
        dq = [d for d in db.scalars(select(Disqualification).where(Disqualification.athlete_id == u.id)) if d.is_active_on(check_on)]
        if dq:
            row.excluded_reason = f"Дисквалификация/отстранение: {dq[0].reason}"
            excluded.append(row)
        else:
            included.append(row)
    included.sort(key=lambda r: (-r.total, r.full_name))
    prev, pos = None, 0
    for i, r in enumerate(included, 1):
        if r.total != prev:
            pos, prev = i, r.total
        r.position = pos
    return included, excluded
