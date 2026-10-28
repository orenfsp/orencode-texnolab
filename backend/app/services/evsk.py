
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AthleteRank, EvskNorm, RatingLevel, SportRank


def best_rank_for(db: Session, level: RatingLevel, place: int | None, participants: int) -> SportRank | None:
    if not place:
        return None
    norms = db.scalars(
        select(EvskNorm).where(
            EvskNorm.rating_level == level, EvskNorm.max_place >= place, EvskNorm.min_participants <= participants
        )
    ).all()
    return max((n.rank for n in norms), key=lambda r: r.level, default=None)


def current_rank(db: Session, athlete_id: int, discipline_id: int, on: date | None = None) -> AthleteRank | None:
    on = on or date.today()
    ranks = db.scalars(
        select(AthleteRank).where(AthleteRank.athlete_id == athlete_id, AthleteRank.discipline_id == discipline_id)
    ).all()
    valid = [r for r in ranks if r.valid_until is None or r.valid_until >= on]
    return max(valid, key=lambda r: r.rank.level, default=None)


def hint(db: Session, athlete_id: int, discipline_id: int, level: RatingLevel, place: int | None, participants: int,
         on: date) -> SportRank | None:
    best = best_rank_for(db, level, place, participants)
    if best is None:
        return None
    cur = current_rank(db, athlete_id, discipline_id, on)
    return best if cur is None or best.level >= cur.rank.level else None


def effective_ranks(ranks: list[AthleteRank], on: date | None = None) -> list[AthleteRank]:
    on = on or date.today()
    best: dict[tuple[int, int], AthleteRank] = {}
    for r in ranks:
        key = (r.athlete_id, r.discipline_id)
        cur = best.get(key)
        valid = r.valid_until is None or r.valid_until >= on
        cur_valid = cur is not None and (cur.valid_until is None or cur.valid_until >= on)
        if cur is None or (valid and not cur_valid) or (valid == cur_valid and (
            r.rank.level > cur.rank.level if valid else r.assigned_at > cur.assigned_at
        )):
            best[key] = r
    return list(best.values())
