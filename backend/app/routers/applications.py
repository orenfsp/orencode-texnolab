from fastapi import APIRouter, BackgroundTasks, HTTPException

from ..deps import DB, AdminPrincipal, CurrentPrincipal
from ..models import Application, ApplicationStatus, CompetitionStatus
from ..models.base import utcnow
from ..schemas import ApplicationDecisionIn, ApplicationOut
from ..services import webhooks
from ..services.audit import log_action
from ..services.notifications import deliver_in_background, notify
from .competitions import application_out

router = APIRouter(prefix="/api/applications", tags=["applications"])

DECISION_RU = {ApplicationStatus.APPROVED: "одобрена", ApplicationStatus.REJECTED: "отклонена"}


def _get(db: DB, app_id: int) -> Application:
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(404, "Заявка не найдена")
    return app


def _decide(app_id: int, decision: ApplicationStatus, data: ApplicationDecisionIn, db: DB, p, bg: BackgroundTasks):
    app = _get(db, app_id)
    if app.competition.status in (CompetitionStatus.COMPLETED, CompetitionStatus.CANCELLED):
        raise HTTPException(409, "Соревнование завершено или отменено")
    if app.status == ApplicationStatus.WITHDRAWN:
        raise HTTPException(409, "Заявка отозвана")
    if decision == ApplicationStatus.REJECTED and not data.comment:
        raise HTTPException(422, "Укажите причину отклонения")
    old = app.status
    app.status = decision
    app.comment = data.comment
    app.decided_at = utcnow()
    app.decided_by_id = p.id
    log_action(db, p, "status", "application", app.id, old=old.value, new=decision.value)
    text = f"«{app.competition.title}»: заявка {DECISION_RU[decision]}"
    if data.comment:
        text += f". Комментарий: {data.comment}"
    recipients = {app.athlete_id, app.submitted_by_id}
    for uid in recipients:
        notify(db, uid, "Статус заявки изменён", text, f"/competitions/{app.competition_id}")
    if decision == ApplicationStatus.APPROVED:
        webhooks.emit(db, "application.approved", {"application_id": app.id, "competition_id": app.competition_id,
                                                  "athlete_id": app.athlete_id})
    db.commit()
    bg.add_task(deliver_in_background)
    bg.add_task(webhooks.deliver_pending)
    return application_out(app)


@router.post("/{app_id}/approve", response_model=ApplicationOut)
def approve(app_id: int, db: DB, p: AdminPrincipal, bg: BackgroundTasks, data: ApplicationDecisionIn | None = None):
    return _decide(app_id, ApplicationStatus.APPROVED, data or ApplicationDecisionIn(), db, p, bg)


@router.post("/{app_id}/reject", response_model=ApplicationOut)
def reject(app_id: int, data: ApplicationDecisionIn, db: DB, p: AdminPrincipal, bg: BackgroundTasks):
    return _decide(app_id, ApplicationStatus.REJECTED, data, db, p, bg)


@router.post("/{app_id}/withdraw", response_model=ApplicationOut)
def withdraw(app_id: int, db: DB, p: CurrentPrincipal):
    app = _get(db, app_id)
    if p.id not in (app.athlete_id, app.submitted_by_id):
        raise HTTPException(403, "Отозвать заявку может спортсмен или подавший её тренер")
    if app.competition.status != CompetitionStatus.REGISTRATION_OPEN:
        raise HTTPException(409, "Приём заявок закрыт - отзыв через федерацию")
    app.status = ApplicationStatus.WITHDRAWN
    log_action(db, p, "status", "application", app.id, new=ApplicationStatus.WITHDRAWN.value)
    db.commit()
    return application_out(app)
