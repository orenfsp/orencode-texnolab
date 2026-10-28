
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from ..deps import DB, AthletePrincipal, CoachPrincipal, CurrentPrincipal, JudgePrincipal
from ..models import (
    Application,
    AthleteRank,
    CoachAthleteLink,
    Competition,
    CompetitionStatus,
    JudgeAssignment,
    LinkStatus,
    Result,
    Role,
    User,
)
from ..models.base import utcnow
from ..schemas import ApplicationOut, HistoryItem
from ..services import evsk
from .competitions import application_out

router = APIRouter(prefix="/api/me", tags=["cabinets"])


def results_history(db: DB, athlete_id: int) -> list[HistoryItem]:
    rows = db.execute(
        select(Result, Competition)
        .join(Competition, Result.competition_id == Competition.id)
        .where(Result.athlete_id == athlete_id, Competition.status == CompetitionStatus.COMPLETED)
        .order_by(Competition.start_date.desc())
    ).all()
    out = []
    for res, comp in rows:
        participants = db.scalar(select(func.count(Result.id)).where(Result.competition_id == comp.id))
        ranked = db.scalar(select(func.count(Result.id)).where(Result.competition_id == comp.id, Result.place.is_not(None)))
        rank_hint = evsk.hint(db, athlete_id, comp.discipline_id, comp.rating_level, res.place, ranked, comp.start_date)
        out.append(
            HistoryItem(
                result_id=res.id,
                evsk_hint=rank_hint.name if rank_hint else None,
                competition_id=comp.id,
                competition_title=comp.title,
                start_date=comp.start_date,
                level=comp.level,
                discipline=comp.discipline.name,
                place=res.place,
                score=res.score,
                participants=participants,
                protocol_url=f"/protocols/{comp.id}",
            )
        )
    return out


@router.get("/applications", response_model=list[ApplicationOut])
def my_applications(db: DB, p: CurrentPrincipal):
    if p.role == Role.ATHLETE:
        cond = Application.athlete_id == p.id
    elif p.role == Role.COACH:
        cond = Application.submitted_by_id == p.id
    else:
        raise HTTPException(403, "Заявки есть у спортсмена и тренера")
    apps = db.scalars(select(Application).where(cond).order_by(Application.created_at.desc())).all()
    return [application_out(a) for a in apps]


@router.get("/results", response_model=list[HistoryItem])
def my_results(db: DB, p: AthletePrincipal):
    return results_history(db, p.id)


class RankInfo(BaseModel):
    discipline: str
    rank: str
    assigned_at: str
    order_number: str
    valid_until: str | None
    days_left: int | None


@router.get("/ranks", response_model=list[RankInfo])
def my_ranks(db: DB, p: AthletePrincipal):
    today = utcnow().date()
    ranks = evsk.effective_ranks(db.scalars(select(AthleteRank).where(AthleteRank.athlete_id == p.id)).all())
    return [
        RankInfo(
            discipline=r.discipline.name,
            rank=r.rank.name,
            assigned_at=r.assigned_at.isoformat(),
            order_number=r.order_number,
            valid_until=r.valid_until.isoformat() if r.valid_until else None,
            days_left=(r.valid_until - today).days if r.valid_until else None,
        )
        for r in ranks
    ]


class CoachAthleteOut(BaseModel):
    link_id: int
    athlete_id: int
    full_name: str
    birth_year: int | None
    discipline_id: int
    discipline: str
    status: LinkStatus


@router.get("/athletes", response_model=list[CoachAthleteOut])
def coach_athletes(db: DB, p: CoachPrincipal):
    links = db.scalars(
        select(CoachAthleteLink)
        .where(CoachAthleteLink.coach_id == p.id, CoachAthleteLink.status != LinkStatus.ENDED)
        .join(User, CoachAthleteLink.athlete_id == User.id)
        .order_by(User.last_name)
    ).all()
    return [
        CoachAthleteOut(
            link_id=l.id,
            athlete_id=l.athlete_id,
            full_name=l.athlete.full_name,
            birth_year=l.athlete.birth_date.year if l.athlete.birth_date else None,
            discipline_id=l.discipline_id,
            discipline=l.discipline.name,
            status=l.status,
        )
        for l in links
    ]


@router.get("/athletes/{athlete_id}/results", response_model=list[HistoryItem])
def coach_athlete_results(athlete_id: int, db: DB, p: CoachPrincipal):
    linked = db.scalar(
        select(CoachAthleteLink.id).where(
            CoachAthleteLink.coach_id == p.id,
            CoachAthleteLink.athlete_id == athlete_id,
            CoachAthleteLink.status.in_([LinkStatus.ACTIVE, LinkStatus.SUSPENDED]),
        )
    )
    if not linked:
        raise HTTPException(403, "Спортсмен не привязан к вам")
    return results_history(db, athlete_id)


class AssignmentOut(BaseModel):
    competition_id: int
    title: str
    start_date: str
    status: CompetitionStatus
    position: str


@router.get("/judging", response_model=list[AssignmentOut])
def judge_assignments(db: DB, p: JudgePrincipal):
    items = db.scalars(select(JudgeAssignment).where(JudgeAssignment.judge_id == p.id)).all()
    items.sort(key=lambda j: j.competition.start_date, reverse=True)
    return [
        AssignmentOut(
            competition_id=j.competition_id,
            title=j.competition.title,
            start_date=j.competition.start_date.isoformat(),
            status=j.competition.status,
            position=j.position.name,
        )
        for j in items
    ]
