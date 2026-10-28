
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import Notification, Role, User, UserRole

log = logging.getLogger("fsp.notify")


def notify(db: Session, user_id: int, title: str, body: str, link: str | None = None) -> Notification:
    n = Notification(user_id=user_id, title=title, body=body, link=link)
    db.add(n)
    return n


def notify_role(db: Session, role: Role, title: str, body: str, link: str | None = None) -> None:
    for uid in db.scalars(select(UserRole.user_id).where(UserRole.role == role)):
        notify(db, uid, title, body, link)


def deliver_pending(db: Session) -> None:
    pending = db.scalars(select(Notification).where(Notification.delivered_external.is_(False))).all()
    for n in pending:
        user = db.get(User, n.user_id)
        text = f"<b>{n.title}</b>\n{n.body}"
        if settings.telegram_bot_token and user and user.telegram_chat_id:
            try:
                httpx.post(
                    f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                    json={"chat_id": user.telegram_chat_id, "text": text, "parse_mode": "HTML"},
                    timeout=5,
                ).raise_for_status()
            except httpx.HTTPError as e:
                log.warning("telegram delivery failed for notification %s: %s", n.id, e)
                continue
        else:
            log.info("[demo outbox] -> user %s: %s | %s", n.user_id, n.title, n.body)
        n.delivered_external = True
    db.commit()


def deliver_in_background() -> None:
    with SessionLocal() as db:
        deliver_pending(db)
