from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import extract, func, select

from ..config import settings
from ..deps import DB, AdminPrincipal, CurrentPrincipal, OptionalPrincipal, Principal
from ..models import (
    Application,
    ApplicationStatus,
    AthleteProfile,
    CoachAthleteLink,
    Competition,
    CompetitionStatus,
    JudgeAssignment,
    LinkStatus,
    Protocol,
    Result,
    Role,
    User,
    UserRole,
    athlete_disciplines,
)
from ..models.base import utcnow
from ..schemas import ApplicationIn, ApplicationOut, CompetitionIn, CompetitionOut, ProtocolOut, ResultIn
from ..services import protocol as proto
from ..services import webhooks
from ..services.audit import log_action
from ..services.competitions import check_eligibility, get_type, infer_rating_level, registration_problem
from ..services.notifications import deliver_in_background, notify, notify_role

router = APIRouter(prefix="/api/competitions", tags=["competitions"])

TRANSITIONS: dict[CompetitionStatus, set[CompetitionStatus]] = {
    CompetitionStatus.DRAFT: {CompetitionStatus.REGISTRATION_OPEN, CompetitionStatus.CANCELLED},
    CompetitionStatus.REGISTRATION_OPEN: {CompetitionStatus.REGISTRATION_CLOSED, CompetitionStatus.CANCELLED},
    CompetitionStatus.REGISTRATION_CLOSED: {CompetitionStatus.REGISTRATION_OPEN, CompetitionStatus.CANCELLED},
    CompetitionStatus.COMPLETED: set(),
    CompetitionStatus.CANCELLED: set(),
}
STATUS_RU = {
    CompetitionStatus.DRAFT: "черновик",
    CompetitionStatus.REGISTRATION_OPEN: "приём заявок открыт",
    CompetitionStatus.REGISTRATION_CLOSED: "приём заявок закрыт",
    CompetitionStatus.COMPLETED: "завершено",
    CompetitionStatus.CANCELLED: "отменено",
}


def get_competition(db: DB, comp_id: int) -> Competition:
    comp = db.get(Competition, comp_id)
    if comp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Соревнование не найдено")
    return comp


def _can_see_drafts(p: Principal | None) -> bool:
    return p is not None and p.role in (Role.ADMIN, Role.MINISTRY)


def to_out(db: DB, comp: Competition, p: Principal | None, athlete: User | None = None) -> CompetitionOut:
    out = CompetitionOut.model_validate(comp)
    out.has_regulation = bool(comp.regulation_file)
    out.applications_count = db.scalar(
        select(func.count(Application.id)).where(
            Application.competition_id == comp.id, Application.status != ApplicationStatus.WITHDRAWN
        )
    )
    if athlete is None and p is not None and p.role == Role.ATHLETE:
        athlete = p.user
    if athlete is not None:
        out.my_application_status = db.scalar(
            select(Application.status).where(
                Application.competition_id == comp.id, Application.athlete_id == athlete.id
            )
        )
        out.eligible, out.eligibility_note = check_eligibility(comp, athlete)
    return out


def _coach_athlete(db: DB, p: Principal, athlete_id: int, discipline_id: int) -> User:
    link = db.scalar(
        select(CoachAthleteLink).where(
            CoachAthleteLink.coach_id == p.id,
            CoachAthleteLink.athlete_id == athlete_id,
            CoachAthleteLink.discipline_id == discipline_id,
            CoachAthleteLink.status == LinkStatus.ACTIVE,
        )
    )
    if link is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Спортсмен не привязан к вам по этой дисциплине")
    return link.athlete




@router.get("", response_model=list[CompetitionOut])
def list_competitions(
    db: DB,
    p: OptionalPrincipal,
    discipline_id: int | None = None,
    age_group_id: int | None = None,
    status_: Annotated[CompetitionStatus | None, Query(alias="status")] = None,
    year: int | None = None,
    for_athlete_id: int | None = Query(None, description="Тренер: показать допуск для подопечного"),
    eligible_only: bool = False,
):
    q = select(Competition).order_by(Competition.start_date)
    if not _can_see_drafts(p):
        q = q.where(Competition.status != CompetitionStatus.DRAFT)
    if discipline_id:
        q = q.where(Competition.discipline_id == discipline_id)
    if age_group_id:
        q = q.where(Competition.age_group_id == age_group_id)
    if status_:
        q = q.where(Competition.status == status_)
    if year:
        q = q.where(extract("year", Competition.start_date) == year)
    athlete = None
    if for_athlete_id and p and p.role == Role.COACH:
        athlete = db.get(User, for_athlete_id)
    items = [to_out(db, c, p, athlete) for c in db.scalars(q).unique()]
    if eligible_only:
        items = [c for c in items if c.eligible]
    return items


@router.get("/{comp_id}", response_model=CompetitionOut)
def get_one(comp_id: int, db: DB, p: OptionalPrincipal):
    comp = get_competition(db, comp_id)
    if comp.status == CompetitionStatus.DRAFT and not _can_see_drafts(p):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Соревнование не найдено")
    return to_out(db, comp, p)


@router.post("", response_model=CompetitionOut, status_code=201)
def create(data: CompetitionIn, db: DB, p: AdminPrincipal):
    ctype = get_type(db, data.type_id)
    if ctype is None:
        raise HTTPException(422, "Неизвестный тип соревнования")
    fields = data.model_dump()
    fields["rating_level"] = data.rating_level or infer_rating_level(data.level, ctype)
    comp = Competition(**fields, created_by_id=p.id)
    db.add(comp)
    db.flush()
    log_action(db, p, "create", "competition", comp.id, title=comp.title)
    db.commit()
    return to_out(db, comp, p)


@router.put("/{comp_id}", response_model=CompetitionOut)
def update(comp_id: int, data: CompetitionIn, db: DB, p: AdminPrincipal):
    comp = get_competition(db, comp_id)
    if comp.status == CompetitionStatus.COMPLETED:
        raise HTTPException(409, "Протокол опубликован - соревнование нельзя изменить")
    ctype = get_type(db, data.type_id)
    if ctype is None:
        raise HTTPException(422, "Неизвестный тип соревнования")
    fields = data.model_dump()
    fields["rating_level"] = data.rating_level or infer_rating_level(data.level, ctype)
    changed = {k: str(v) for k, v in fields.items() if getattr(comp, k) != v}
    for k, v in fields.items():
        setattr(comp, k, v)
    log_action(db, p, "update", "competition", comp.id, changed=changed)
    db.commit()
    db.refresh(comp)
    return to_out(db, comp, p)


@router.post("/{comp_id}/status", response_model=CompetitionOut)
def change_status(
    comp_id: int,
    db: DB,
    p: AdminPrincipal,
    bg: BackgroundTasks,
    new_status: Annotated[CompetitionStatus, Body(embed=True, alias="status")],
):
    comp = get_competition(db, comp_id)
    if new_status not in TRANSITIONS[comp.status]:
        raise HTTPException(409, f"Переход «{STATUS_RU[comp.status]}» → «{STATUS_RU[new_status]}» недопустим")
    old = comp.status
    comp.status = new_status
    log_action(db, p, "status", "competition", comp.id, old=old.value, new=new_status.value)
    if new_status == CompetitionStatus.REGISTRATION_OPEN:
        athlete_ids = db.scalars(
            select(athlete_disciplines.c.athlete_id).where(athlete_disciplines.c.discipline_id == comp.discipline_id)
        ).all()
        coach_ids = db.scalars(select(UserRole.user_id).where(UserRole.role == Role.COACH)).all()
        deadline = f" до {comp.registration_deadline:%d.%m.%Y}" if comp.registration_deadline else ""
        for uid in set(athlete_ids) | set(coach_ids):
            notify(db, uid, "Открыта регистрация", f"«{comp.title}»: приём заявок{deadline}", f"/competitions/{comp.id}")
        if old == CompetitionStatus.DRAFT:
            webhooks.emit(db, "competition.published", {"competition_id": comp.id, "title": comp.title,
                                                       "start_date": comp.start_date.isoformat()})
    db.commit()
    bg.add_task(deliver_in_background)
    bg.add_task(webhooks.deliver_pending)
    return to_out(db, comp, p)




@router.post("/{comp_id}/regulation", response_model=CompetitionOut)
async def upload_regulation(comp_id: int, file: UploadFile, db: DB, p: AdminPrincipal):
    comp = get_competition(db, comp_id)
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in {"pdf", "docx", "doc"}:
        raise HTTPException(422, "Положение принимается в формате PDF или DOC(X)")
    folder = settings.storage_dir / "regulations"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"competition_{comp.id}.{ext}"
    path.write_bytes(await file.read())
    comp.regulation_file = path.name
    log_action(db, p, "upload", "competition_regulation", comp.id, filename=file.filename)
    db.commit()
    return to_out(db, comp, p)


@router.get("/{comp_id}/regulation")
def download_regulation(comp_id: int, db: DB):
    comp = get_competition(db, comp_id)
    if not comp.regulation_file or comp.status == CompetitionStatus.DRAFT:
        raise HTTPException(404, "Положение не опубликовано")
    return FileResponse(settings.storage_dir / "regulations" / comp.regulation_file, filename=comp.regulation_file)




def application_out(a: Application) -> ApplicationOut:
    prof: AthleteProfile | None = a.athlete.athlete
    org = prof.organization if prof else None
    return ApplicationOut(
        id=a.id,
        competition_id=a.competition_id,
        competition_title=a.competition.title,
        athlete_id=a.athlete_id,
        athlete_name=a.athlete.full_name,
        athlete_birth_year=a.athlete.birth_date.year if a.athlete.birth_date else None,
        organization=(org.short_name or org.name) if org else "без организации",
        submitted_by_name=a.submitted_by.full_name,
        submitted_as=a.submitted_as,
        status=a.status,
        comment=a.comment,
        created_at=a.created_at,
    )


@router.get("/{comp_id}/applications", response_model=list[ApplicationOut])
def list_applications(comp_id: int, db: DB, p: CurrentPrincipal):
    in_panel = p.role == Role.JUDGE and db.scalar(
        select(JudgeAssignment.id).where(JudgeAssignment.competition_id == comp_id, JudgeAssignment.judge_id == p.id)
    )
    if p.role not in (Role.ADMIN, Role.MINISTRY) and not in_panel:
        raise HTTPException(403, "Список заявок доступен федерации и судейской коллегии")
    get_competition(db, comp_id)
    apps = db.scalars(
        select(Application).where(Application.competition_id == comp_id).order_by(Application.created_at)
    ).all()
    return [application_out(a) for a in apps]


@router.post("/{comp_id}/applications", response_model=ApplicationOut, status_code=201)
def submit_application(comp_id: int, data: ApplicationIn, db: DB, p: CurrentPrincipal, bg: BackgroundTasks):
    comp = get_competition(db, comp_id)
    if p.role == Role.ATHLETE:
        athlete = p.user
    elif p.role == Role.COACH:
        if not data.athlete_id:
            raise HTTPException(422, "Укажите спортсмена")
        athlete = _coach_athlete(db, p, data.athlete_id, comp.discipline_id)
    else:
        raise HTTPException(403, "Заявку подаёт спортсмен или его тренер")

    if problem := registration_problem(comp):
        raise HTTPException(409, problem)
    ok, note = check_eligibility(comp, athlete)
    if not ok:
        raise HTTPException(409, note)

    existing = db.scalar(
        select(Application).where(Application.competition_id == comp.id, Application.athlete_id == athlete.id)
    )
    if existing and existing.status != ApplicationStatus.WITHDRAWN:
        raise HTTPException(409, "Заявка на это соревнование уже подана")
    app = existing or Application(competition_id=comp.id, athlete_id=athlete.id)
    app.submitted_by_id = p.id
    app.submitted_as = p.role
    app.status = ApplicationStatus.SUBMITTED
    app.comment = None
    app.decided_at = None
    db.add(app)
    db.flush()
    log_action(db, p, "create", "application", app.id, competition_id=comp.id, athlete_id=athlete.id)
    notify_role(db, Role.ADMIN, "Новая заявка на модерации", f"{athlete.full_name} - «{comp.title}»", f"/admin/competitions/{comp.id}")
    if p.role == Role.COACH:
        notify(db, athlete.id, "Тренер подал заявку", f"«{comp.title}»: заявка подана тренером {p.user.full_name}", "/athlete/applications")
    db.commit()
    db.refresh(app)
    bg.add_task(deliver_in_background)
    return application_out(app)




def _approved_ids(db: DB, comp_id: int) -> set[int]:
    return set(
        db.scalars(
            select(Application.athlete_id).where(
                Application.competition_id == comp_id, Application.status == ApplicationStatus.APPROVED
            )
        )
    )


@router.put("/{comp_id}/results", response_model=ProtocolOut)
def save_results(comp_id: int, items: list[ResultIn], db: DB, p: AdminPrincipal):
    comp = get_competition(db, comp_id)
    if comp.status != CompetitionStatus.REGISTRATION_CLOSED:
        raise HTTPException(409, "Результаты вносятся после закрытия приёма заявок и до публикации протокола")
    allowed = _approved_ids(db, comp.id)
    if unknown := {i.athlete_id for i in items} - allowed:
        raise HTTPException(422, f"Нет одобренной заявки у спортсменов: {sorted(unknown)}")
    by_athlete = {r.athlete_id: r for r in comp.results}
    for item in items:
        r = by_athlete.get(item.athlete_id)
        if r is None:
            r = Result(competition_id=comp.id, athlete_id=item.athlete_id)
            comp.results.append(r)
            by_athlete[item.athlete_id] = r
        r.score = item.score
        r.note = item.note
        r.place_manual = item.place is not None
        r.place = item.place
    proto.assign_places(comp.results)
    log_action(db, p, "results", "competition", comp.id, count=len(items))
    db.commit()
    db.refresh(comp)
    return _protocol_out(db, comp, p)


def _protocol_out(db: DB, comp: Competition, p: Principal | None) -> ProtocolOut:
    return ProtocolOut(
        competition=to_out(db, comp, p),
        number=comp.protocol.number if comp.protocol else None,
        published_at=comp.protocol.published_at if comp.protocol else None,
        rows=proto.build_rows(db, comp),
        judges=proto.build_judges(db, comp),
    )


@router.post("/{comp_id}/protocol/publish", response_model=ProtocolOut)
def publish_protocol(comp_id: int, db: DB, p: AdminPrincipal, bg: BackgroundTasks):
    comp = get_competition(db, comp_id)
    if comp.status != CompetitionStatus.REGISTRATION_CLOSED:
        raise HTTPException(409, "Протокол публикуется после закрытия приёма заявок")
    if not comp.results:
        raise HTTPException(409, "Нет результатов для протокола")
    number = f"{comp.start_date.year}-{comp.id:04d}"
    comp.protocol = Protocol(number=number, published_by_id=p.id, published_at=utcnow())
    comp.status = CompetitionStatus.COMPLETED
    log_action(db, p, "publish", "protocol", comp.id, number=number)
    for r in comp.results:
        place = f"место {r.place}" if r.place else "без места"
        notify(db, r.athlete_id, "Опубликован протокол", f"«{comp.title}»: {place}", f"/protocols/{comp.id}")
    webhooks.emit(db, "protocol.published", {"competition_id": comp.id, "title": comp.title, "number": number})
    db.commit()
    db.refresh(comp)
    bg.add_task(deliver_in_background)
    bg.add_task(webhooks.deliver_pending)
    return _protocol_out(db, comp, p)


def _protocol_access(db: DB, comp_id: int, p: Principal | None) -> Competition:
    comp = get_competition(db, comp_id)
    if comp.status != CompetitionStatus.COMPLETED and not _can_see_drafts(p):
        raise HTTPException(404, "Протокол ещё не опубликован")
    return comp


@router.get("/{comp_id}/protocol", response_model=ProtocolOut)
def get_protocol(comp_id: int, db: DB, p: OptionalPrincipal):
    return _protocol_out(db, _protocol_access(db, comp_id, p), p)


@router.get("/{comp_id}/protocol.{fmt}")
def export_protocol(comp_id: int, fmt: str, db: DB, p: OptionalPrincipal):
    comp = _protocol_access(db, comp_id, p)
    data = _protocol_out(db, comp, p)
    if fmt == "xlsx":
        content = proto.export_xlsx(comp, data.number, data.rows, data.judges)
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif fmt == "docx":
        content = proto.export_docx(comp, data.number, data.rows, data.judges)
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        raise HTTPException(404, "Поддерживаются форматы xlsx и docx")
    filename = f"protocol_{comp.id}_{date.today():%Y%m%d}.{fmt}"
    return Response(content, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
