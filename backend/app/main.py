import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models
from .config import BASE_DIR, settings
from .db import Base, SessionLocal, engine
from .routers import (
    admin,
    applications,
    auth,
    competitions,
    deadlines,
    dictionaries,
    extras,
    integrations,
    judges,
    me,
    notifications,
    oidc,
    people,
    ranks,
    rating,
    reports,
    training,
)
from .services.deadlines import run_reminders
from .services.notifications import deliver_pending
from .services.telegram import start_bot

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("fsp")

REMINDER_INTERVAL = 6 * 60 * 60


async def _reminder_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                run_reminders(db)
                deliver_pending(db)
        except Exception:
            log.exception("reminder loop failed")
        await asyncio.sleep(REMINDER_INTERVAL)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    bot_stop = start_bot()
    task = asyncio.create_task(_reminder_loop())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
    if bot_stop:
        bot_stop.set()


app = FastAPI(
    lifespan=lifespan,
    title="ФСП Оренбургской области - цифровая платформа",
    description="API единой платформы регионального отделения Федерации спортивного программирования.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (
    auth, dictionaries, competitions, applications, me, admin, notifications, people, judges, ranks,
    deadlines, reports, rating, extras, training, integrations, oidc,
):
    app.include_router(r.router)

app.mount("/demo-client", StaticFiles(directory=BASE_DIR / "demo_client", html=True), name="demo-client")


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}
