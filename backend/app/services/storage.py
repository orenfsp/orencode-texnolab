import re
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from ..config import settings

MAX_UPLOAD = 50 * 1024 * 1024
ALLOWED_EVIDENCE = {"png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "log", "zip", "mp4", "webm", "mov", "json", "csv"}


def folder(sub: str) -> Path:
    p = settings.storage_dir / sub
    p.mkdir(parents=True, exist_ok=True)
    return p


async def save_upload(sub: str, file: UploadFile, allowed: set[str] | None = None) -> tuple[str, str]:
    name = file.filename or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if allowed and ext not in allowed:
        raise HTTPException(422, f"Недопустимый тип файла: .{ext}")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Файл больше 50 МБ")
    safe = re.sub(r"[^\w.\-]", "_", name)[-80:]
    stored = f"{secrets.token_hex(8)}_{safe}"
    (folder(sub) / stored).write_bytes(data)
    return name, stored
