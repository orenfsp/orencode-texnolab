from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update

from ..deps import DB, CurrentPrincipal
from ..models import Notification
from ..models.base import utcnow
from ..schemas import NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def my_notifications(db: DB, p: CurrentPrincipal, limit: int = 30):
    return db.scalars(
        select(Notification).where(Notification.user_id == p.id).order_by(Notification.id.desc()).limit(limit)
    ).all()


@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, db: DB, p: CurrentPrincipal):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != p.id:
        raise HTTPException(404, "Уведомление не найдено")
    n.read_at = n.read_at or utcnow()
    db.commit()


@router.post("/read-all", status_code=204)
def mark_all_read(db: DB, p: CurrentPrincipal):
    db.execute(
        update(Notification).where(Notification.user_id == p.id, Notification.read_at.is_(None)).values(read_at=utcnow())
    )
    db.commit()
