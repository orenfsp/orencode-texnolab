
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from ..deps import DB, AdminPrincipal, CurrentPrincipal, ReaderPrincipal
from ..models import (
    AthleteRank,
    CoachAthleteLink,
    Competition,
    CompetitionStatus,
    LinkStatus,
    RankRequest,
    RequestKind,
    RequestStatus,
    Result,
    Role,
    SportRank,
    User,
)
from ..models.base import utcnow
from ..services import evsk
from ..services.audit import log_action
from ..services.dates import days_left, valid_until
from ..services.notifications import notify, notify_role

router = APIRouter(prefix="/api", tags=["ranks"])


class RankRequestIn(BaseModel):
    result_id: int
    rank_id: int
    kind: RequestKind
    athlete_id: int | None = None


class RankRequestOut(BaseModel):
    id: int
    athlete_id: int
    athlete_name: str
    submitted_by: str
    discipline: str
    rank: str
    kind: RequestKind
    competition_id: int
    competition: str
    place: int | None
    score: float | None
    evsk_hint: str | None
    status: RequestStatus
    comment: str | None
    created_at: str


def request_out(db: DB, r: RankRequest) -> RankRequestOut:
    res = db.get(Result, r.result_id)
    comp = res.competition
    ranked = db.scalar(select(func.count(Result.id)).where(Result.competition_id == comp.id, Result.place.is_not(None)))
    best = evsk.best_rank_for(db, comp.rating_level, res.place, ranked)
    return RankRequestOut(
        id=r.id,
        athlete_id=r.athlete_id,
        athlete_name=r.athlete.full_name,
        submitted_by=db.get(User, r.submitted_by_id).full_name,
        discipline=comp.discipline.name,
        rank=r.rank.name,
        kind=r.kind,
        competition_id=comp.id,
        competition=comp.title,
        place=res.place,
        score=res.score,
        evsk_hint=best.name if best else None,
        status=r.status,
        comment=r.comment,
        created_at=r.created_at.isoformat(),
    )


def _has_active_coach(db: DB, athlete_id: int, discipline_id: int) -> bool:
    return bool(
        db.scalar(
            select(CoachAthleteLink.id).where(
                CoachAthleteLink.athlete_id == athlete_id,
                CoachAthleteLink.discipline_id == discipline_id,
                CoachAthleteLink.status == LinkStatus.ACTIVE,
            )
        )
    )


@router.post("/rank-requests", response_model=RankRequestOut, status_code=201)
def submit_rank_request(data: RankRequestIn, db: DB, p: CurrentPrincipal):
    res = db.get(Result, data.result_id)
    if res is None or res.competition.status != CompetitionStatus.COMPLETED:
        raise HTTPException(422, "Укажите результат из опубликованного протокола")
    discipline_id = res.competition.discipline_id
    if p.role == Role.ATHLETE:
        athlete_id = p.id
        if _has_active_coach(db, p.id, discipline_id):
            raise HTTPException(409, "У вас есть тренер по этой дисциплине - заявку подаёт тренер")
    elif p.role == Role.COACH:
        athlete_id = data.athlete_id or res.athlete_id
        linked = db.scalar(
            select(CoachAthleteLink.id).where(
                CoachAthleteLink.coach_id == p.id,
                CoachAthleteLink.athlete_id == athlete_id,
                CoachAthleteLink.discipline_id == discipline_id,
                CoachAthleteLink.status == LinkStatus.ACTIVE,
            )
        )
        if not linked:
            raise HTTPException(403, "Спортсмен не привязан к вам по этой дисциплине")
    else:
        raise HTTPException(403, "Заявку на разряд подаёт тренер или спортсмен")
    if res.athlete_id != athlete_id:
        raise HTTPException(422, "Результат принадлежит другому спортсмену")
    if db.get(SportRank, data.rank_id) is None:
        raise HTTPException(422, "Неизвестный разряд")
    dup = db.scalar(
        select(RankRequest.id).where(
            RankRequest.result_id == res.id, RankRequest.status == RequestStatus.SUBMITTED
        )
    )
    if dup:
        raise HTTPException(409, "По этому результату уже есть заявка на рассмотрении")
    r = RankRequest(
        athlete_id=athlete_id, submitted_by_id=p.id, discipline_id=discipline_id,
        rank_id=data.rank_id, kind=data.kind, result_id=res.id,
    )
    db.add(r)
    db.flush()
    log_action(db, p, "create", "rank_request", r.id, rank_id=data.rank_id, result_id=res.id)
    notify_role(db, Role.ADMIN, "Заявка на разряд", f"{res.athlete.full_name}: {r.rank.name if r.rank else ''}", "/admin/ranks")
    db.commit()
    db.refresh(r)
    return request_out(db, r)


@router.get("/me/rank-requests", response_model=list[RankRequestOut])
def my_rank_requests(db: DB, p: CurrentPrincipal):
    col = RankRequest.athlete_id if p.role == Role.ATHLETE else RankRequest.submitted_by_id
    return [request_out(db, r) for r in db.scalars(select(RankRequest).where(col == p.id).order_by(RankRequest.id.desc()))]


@router.get("/admin/rank-requests", response_model=list[RankRequestOut])
def rank_requests(db: DB, _: ReaderPrincipal, status: RequestStatus | None = None):
    stmt = select(RankRequest).order_by(RankRequest.id.desc())
    if status:
        stmt = stmt.where(RankRequest.status == status)
    return [request_out(db, r) for r in db.scalars(stmt)]


class RankDecisionIn(BaseModel):
    order_number: str | None = None
    assigned_at: date | None = None
    comment: str | None = None


@router.post("/admin/rank-requests/{req_id}/{decision}", response_model=RankRequestOut)
def decide_rank_request(req_id: int, decision: str, data: RankDecisionIn, db: DB, p: AdminPrincipal):
    r = db.get(RankRequest, req_id)
    if r is None:
        raise HTTPException(404, "Заявка не найдена")
    if r.status != RequestStatus.SUBMITTED:
        raise HTTPException(409, "Заявка уже рассмотрена")
    if decision == "approve":
        if not data.order_number:
            raise HTTPException(422, "Укажите номер приказа")
        assigned = data.assigned_at or date.today()
        db.add(
            AthleteRank(
                athlete_id=r.athlete_id, discipline_id=r.discipline_id, rank_id=r.rank_id, assigned_at=assigned,
                order_number=data.order_number, valid_until=valid_until(assigned, r.rank.validity_years),
                basis_result_id=r.result_id, request_id=r.id,
            )
        )
        r.status = RequestStatus.APPROVED
        text = f"{r.rank.name}: присвоен, приказ {data.order_number}"
    elif decision == "reject":
        if not data.comment:
            raise HTTPException(422, "Укажите причину отказа")
        r.status = RequestStatus.REJECTED
        text = f"{r.rank.name}: отказано. {data.comment}"
    else:
        raise HTTPException(404, "Неизвестное действие")
    r.comment = data.comment
    r.decided_at = utcnow()
    r.decided_by_id = p.id
    log_action(db, p, "status", "rank_request", r.id, new=r.status.value, order=data.order_number)
    for uid in {r.athlete_id, r.submitted_by_id}:
        notify(db, uid, "Заявка на разряд рассмотрена", text, "/athlete/results")
    db.commit()
    return request_out(db, r)


class AssignedRankOut(BaseModel):
    id: int
    athlete_id: int
    athlete_name: str
    discipline: str
    rank: str
    assigned_at: date
    order_number: str
    valid_until: date | None
    days_left: int | None
    basis: str | None


def assigned_out(db: DB, r: AthleteRank) -> AssignedRankOut:
    basis = None
    if r.basis_result_id:
        res = db.get(Result, r.basis_result_id)
        basis = f"{res.competition.title}, место {res.place}" if res else None
    return AssignedRankOut(
        id=r.id, athlete_id=r.athlete_id, athlete_name=r.athlete.full_name, discipline=r.discipline.name,
        rank=r.rank.name, assigned_at=r.assigned_at, order_number=r.order_number, valid_until=r.valid_until,
        days_left=days_left(r.valid_until), basis=basis,
    )


@router.get("/admin/ranks", response_model=list[AssignedRankOut])
def assigned_ranks(db: DB, _: ReaderPrincipal, expiring_days: int | None = None):
    rows = [assigned_out(db, r) for r in db.scalars(select(AthleteRank).order_by(AthleteRank.assigned_at.desc()))]
    if expiring_days is not None:
        rows = [r for r in rows if r.days_left is not None and 0 <= r.days_left <= expiring_days]
    return rows


@router.get("/athletes/{athlete_id}/ranks", response_model=list[AssignedRankOut])
def athlete_ranks(athlete_id: int, db: DB, p: CurrentPrincipal):
    if p.id != athlete_id and p.role not in (Role.ADMIN, Role.MINISTRY, Role.COACH):
        raise HTTPException(403, "Нет доступа")
    return [assigned_out(db, r) for r in db.scalars(select(AthleteRank).where(AthleteRank.athlete_id == athlete_id))]


class CandidateOut(BaseModel):
    athlete_id: int
    athlete_name: str
    discipline: str
    competition_id: int
    competition: str
    date: date
    place: int
    result_id: int
    current_rank: str | None
    candidate_rank: str
    candidate_rank_id: int
    has_request: bool


@router.get("/admin/rank-candidates", response_model=list[CandidateOut])
def rank_candidates(db: DB, _: ReaderPrincipal, year: int | None = None):
    year = year or date.today().year
    comps = db.scalars(
        select(Competition).where(
            Competition.status == CompetitionStatus.COMPLETED,
            Competition.start_date >= date(year - 1, 1, 1),
        )
    ).all()
    out = []
    for comp in comps:
        ranked = [r for r in comp.results if r.place]
        for res in ranked:
            best = evsk.hint(db, res.athlete_id, comp.discipline_id, comp.rating_level, res.place, len(ranked), comp.start_date)
            if best is None:
                continue
            cur = evsk.current_rank(db, res.athlete_id, comp.discipline_id)
            out.append(
                CandidateOut(
                    athlete_id=res.athlete_id, athlete_name=res.athlete.full_name, discipline=comp.discipline.name,
                    competition_id=comp.id, competition=comp.title, date=comp.start_date, place=res.place,
                    result_id=res.id, current_rank=cur.rank.name if cur else None, candidate_rank=best.name,
                    candidate_rank_id=best.id,
                    has_request=bool(db.scalar(select(RankRequest.id).where(RankRequest.result_id == res.id))),
                )
            )
    out.sort(key=lambda c: c.date, reverse=True)
    return out
