from datetime import date

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from ..deps import DB, AdminPrincipal, CurrentPrincipal
from ..services.deadlines import deadlines_for, run_reminders
from ..services.notifications import deliver_in_background

router = APIRouter(prefix="/api", tags=["deadlines"])


class DeadlineOut(BaseModel):
    kind: str
    title: str
    detail: str
    due: date
    days_left: int
    link: str | None


@router.get("/me/deadlines", response_model=list[DeadlineOut])
def my_deadlines(db: DB, p: CurrentPrincipal):
    return [
        DeadlineOut(kind=d.kind, title=d.title, detail=d.detail, due=d.due, days_left=d.days_left, link=d.link)
        for d in deadlines_for(db, p.user, p.role)
    ]


@router.post("/admin/reminders/run")
def run_now(db: DB, _: AdminPrincipal, bg: BackgroundTasks):
    sent = run_reminders(db)
    bg.add_task(deliver_in_background)
    return {"sent": sent}
