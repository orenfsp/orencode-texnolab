
import hashlib
import hmac
import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Webhook, WebhookDelivery

log = logging.getLogger("fsp.webhooks")

EVENTS = {
    "competition.published": "Опубликовано соревнование (открыт приём заявок)",
    "application.approved": "Одобрена заявка на участие",
    "protocol.published": "Опубликован протокол",
}


def emit(db: Session, event: str, payload: dict) -> None:
    for wh in db.scalars(select(Webhook).where(Webhook.is_active)):
        if event in wh.events:
            db.add(WebhookDelivery(webhook_id=wh.id, event=event, payload=payload))


def sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def deliver_pending() -> None:
    with SessionLocal() as db:
        pending = db.scalars(
            select(WebhookDelivery).where(WebhookDelivery.status_code.is_(None), WebhookDelivery.error.is_(None))
        ).all()
        for d in pending:
            wh = db.get(Webhook, d.webhook_id)
            body = json.dumps({"event": d.event, "data": d.payload, "delivery_id": d.id}, ensure_ascii=False, default=str).encode()
            try:
                r = httpx.post(wh.url, content=body, timeout=5, headers={
                    "Content-Type": "application/json", "X-FSP-Event": d.event, "X-FSP-Signature": sign(wh.secret, body),
                })
                d.status_code = r.status_code
            except httpx.HTTPError as e:
                d.error = str(e)[:500]
                log.warning("webhook %s failed: %s", wh.url, e)
        db.commit()
