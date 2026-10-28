
import hashlib
import hmac
import logging
import threading

import httpx

from ..config import settings
from ..db import SessionLocal

log = logging.getLogger("fsp.telegram")
_bot_username: str | None = None


def _sign(user_id: int) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"tg:{user_id}".encode(), hashlib.sha256).hexdigest()[:16]


def make_code(user_id: int) -> str:
    return f"{user_id}-{_sign(user_id)}"


def parse_code(code: str) -> int | None:
    try:
        uid, sig = code.split("-", 1)
        return int(uid) if hmac.compare_digest(sig, _sign(int(uid))) else None
    except ValueError:
        return None


def link_url(user_id: int) -> str | None:
    return f"https://t.me/{_bot_username}?start={make_code(user_id)}" if _bot_username else None


def _api(method: str, **params):
    r = httpx.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}", json=params, timeout=40)
    r.raise_for_status()
    return r.json()["result"]


def _handle(update: dict) -> None:
    from ..models import User

    msg = update.get("message") or {}
    text: str = msg.get("text") or ""
    chat_id = msg.get("chat", {}).get("id")
    if not chat_id or not text.startswith("/start"):
        return
    parts = text.split(maxsplit=1)
    uid = parse_code(parts[1]) if len(parts) == 2 else None
    with SessionLocal() as db:
        user = db.get(User, uid) if uid else None
        if user is None:
            _api("sendMessage", chat_id=chat_id, text="Откройте ссылку «Подключить Telegram» в профиле на платформе ФСП.")
            return
        user.telegram_chat_id = str(chat_id)
        db.commit()
        _api("sendMessage", chat_id=chat_id, text=f"Готово, {user.first_name}! Уведомления платформы ФСП будут приходить сюда.")


def _poll(stop: threading.Event) -> None:
    offset = 0
    while not stop.is_set():
        try:
            for upd in _api("getUpdates", offset=offset, timeout=30):
                offset = upd["update_id"] + 1
                _handle(upd)
        except Exception as e:
            log.warning("telegram polling error: %s", e)
            stop.wait(10)


def start_bot() -> threading.Event | None:
    global _bot_username
    if not settings.telegram_bot_token:
        return None
    try:
        _bot_username = _api("getMe")["username"]
    except Exception as e:
        log.warning("telegram bot disabled: %s", e)
        return None
    stop = threading.Event()
    threading.Thread(target=_poll, args=(stop,), daemon=True, name="telegram-bot").start()
    log.info("telegram bot @%s started", _bot_username)
    return stop
