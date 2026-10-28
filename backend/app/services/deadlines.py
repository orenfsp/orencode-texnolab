
import logging
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    AthleteRank,
    CoachAthleteLink,
    Competition,
    CompetitionStatus,
    JudgeQualification,
    LinkStatus,
    ReminderLog,
    Role,
    Setting,
    User,
    UserRole,
    athlete_disciplines,
)
from .competitions import check_eligibility
from .evsk import effective_ranks
from .notifications import notify

log = logging.getLogger("fsp.reminders")

THRESHOLDS = (1, 7, 30)
EXPIRY_WINDOW = 90
DEFAULT_REPORTS = [
    {"title": "Ходатайства на премии Губернатора", "month": 2, "day": 1, "link": "/admin/prizes"},
    {"title": "Годовой статистический отчёт 1-ФК в министерство", "month": 1, "day": 20, "link": "/admin/reports"},
    {"title": "Отчёт о проведённых соревнованиях за полугодие", "month": 7, "day": 10, "link": "/admin/reports"},
]


@dataclass
class Deadline:
    kind: str
    ref: str
    title: str
    detail: str
    due: date
    link: str | None = None

    @property
    def days_left(self) -> int:
        return (self.due - date.today()).days


def _next_occurrence(month: int, day: int, today: date) -> date:
    d = date(today.year, month, day)
    return d if d >= today else date(today.year + 1, month, day)


def report_deadlines(db: Session, today: date) -> list[Deadline]:
    setting = db.get(Setting, "report_deadlines")
    items = setting.value if setting else DEFAULT_REPORTS
    out = []
    for r in items:
        due = _next_occurrence(r["month"], r["day"], today)
        out.append(Deadline("report", f"report:{r['title']}:{due}", r["title"], "Срок подачи", due, r.get("link")))
    return out


def _open_competitions(db: Session, today: date) -> list[Competition]:
    return db.scalars(
        select(Competition).where(
            Competition.status == CompetitionStatus.REGISTRATION_OPEN,
            Competition.registration_deadline >= today,
        )
    ).all()


def _registration(c: Competition) -> Deadline:
    return Deadline("registration", f"reg:{c.id}", "Окончание приёма заявок", c.title, c.registration_deadline, f"/competitions/{c.id}")


def _rank(r: AthleteRank, who: str = "") -> Deadline:
    return Deadline("rank", f"rank:{r.id}", "Истекает разряд", f"{who}{r.rank.name} ({r.discipline.name})", r.valid_until, "/athlete/results")


def _judge(q: JudgeQualification, who: str = "") -> Deadline:
    return Deadline("judge_category", f"jq:{q.id}", "Истекает судейская категория", f"{who}{q.category.name}", q.valid_until, "/judge")


def _expiring(rows, today: date):
    return [r for r in rows if r.valid_until and today <= r.valid_until <= date.fromordinal(today.toordinal() + EXPIRY_WINDOW)]


def deadlines_for(db: Session, user: User, role: Role, today: date | None = None) -> list[Deadline]:
    today = today or date.today()
    out: list[Deadline] = []
    if role == Role.ATHLETE and user.athlete:
        mine = {d.id for d in user.athlete.disciplines}
        for c in _open_competitions(db, today):
            if c.discipline_id in mine and check_eligibility(c, user)[0]:
                out.append(_registration(c))
        mine_ranks = effective_ranks(db.scalars(select(AthleteRank).where(AthleteRank.athlete_id == user.id)).all(), today)
        out += [_rank(r) for r in mine_ranks if r.valid_until and r.valid_until >= today]
    elif role == Role.COACH:
        links = db.scalars(
            select(CoachAthleteLink).where(CoachAthleteLink.coach_id == user.id, CoachAthleteLink.status == LinkStatus.ACTIVE)
        ).all()
        disciplines = {l.discipline_id for l in links}
        out += [_registration(c) for c in _open_competitions(db, today) if c.discipline_id in disciplines]
        pupils = {l.athlete_id for l in links}
        if pupils:
            ranks = effective_ranks(db.scalars(select(AthleteRank).where(AthleteRank.athlete_id.in_(pupils))).all(), today)
            out += [_rank(r, f"{r.athlete.full_name}: ") for r in _expiring(ranks, today)]
    elif role == Role.JUDGE:
        q = db.scalars(
            select(JudgeQualification).where(JudgeQualification.judge_id == user.id).order_by(JudgeQualification.assigned_at.desc())
        ).first()
        if q and q.valid_until and q.valid_until >= today:
            out.append(_judge(q))
    elif role in (Role.ADMIN, Role.MINISTRY):
        out += [_registration(c) for c in _open_competitions(db, today)]
        out += [_rank(r, f"{r.athlete.full_name}: ") for r in _expiring(effective_ranks(db.scalars(select(AthleteRank)).all(), today), today)]
        out += [_judge(q, f"{q.judge.full_name}: ") for q in _expiring(db.scalars(select(JudgeQualification)).all(), today)]
        out += report_deadlines(db, today)
    out.sort(key=lambda d: d.due)
    return out




def _threshold(days_left: int) -> int | None:
    return next((t for t in THRESHOLDS if 0 <= days_left <= t), None)


def _remind(db: Session, user_id: int, d: Deadline) -> bool:
    t = _threshold(d.days_left)
    if t is None:
        return False
    key = f"{user_id}:{d.ref}:{t}"
    if db.get(ReminderLog, key):
        return False
    db.add(ReminderLog(key=key))
    when = "сегодня" if d.days_left == 0 else f"через {d.days_left} дн. ({d.due:%d.%m.%Y})"
    notify(db, user_id, f"Срок: {d.title.lower()}", f"{d.detail} - {when}", d.link)
    return True


def run_reminders(db: Session, today: date | None = None) -> int:
    today = today or date.today()
    sent = 0
    for c in _open_competitions(db, today):
        d = _registration(c)
        if _threshold(d.days_left) is None:
            continue
        athletes = db.scalars(
            select(User).join(athlete_disciplines, athlete_disciplines.c.athlete_id == User.id)
            .where(athlete_disciplines.c.discipline_id == c.discipline_id)
        ).all()
        for a in athletes:
            if check_eligibility(c, a)[0] and not any(app.athlete_id == a.id for app in c.applications):
                sent += _remind(db, a.id, d)
        coaches = set(db.scalars(
            select(CoachAthleteLink.coach_id).where(
                CoachAthleteLink.discipline_id == c.discipline_id, CoachAthleteLink.status == LinkStatus.ACTIVE
            )
        ))
        for cid in coaches:
            sent += _remind(db, cid, d)
    for r in _expiring(effective_ranks(db.scalars(select(AthleteRank)).all(), today), today):
        sent += _remind(db, r.athlete_id, _rank(r))
        for cid in db.scalars(select(CoachAthleteLink.coach_id).where(
            CoachAthleteLink.athlete_id == r.athlete_id, CoachAthleteLink.discipline_id == r.discipline_id,
            CoachAthleteLink.status == LinkStatus.ACTIVE,
        )):
            sent += _remind(db, cid, _rank(r, f"{r.athlete.full_name}: "))
    for q in _expiring(db.scalars(select(JudgeQualification)).all(), today):
        sent += _remind(db, q.judge_id, _judge(q))
    admins = db.scalars(select(UserRole.user_id).where(UserRole.role == Role.ADMIN)).all()
    for d in report_deadlines(db, today):
        for uid in admins:
            sent += _remind(db, uid, d)
    db.commit()
    if sent:
        log.info("reminders sent: %s", sent)
    return sent
