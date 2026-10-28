
from datetime import date

from fastapi import APIRouter, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from ..config import settings
from ..deps import DB, AdminPrincipal, CurrentPrincipal, ReaderPrincipal
from ..models import (
    CalendarPlan,
    CoachAthleteLink,
    Competition,
    CompetitionStatus,
    IndicatorDocument,
    LinkStatus,
    Organization,
    Role,
    User,
)
from ..services import documents as docs
from ..services.audit import log_action
from ..services.headcount import SLICES, change_pct, default_years, headcount
from .me import results_history

router = APIRouter(prefix="/api", tags=["reports"])

LEVEL_RU = {"regional": "Региональное", "interregional": "Межрегиональное", "all_russian": "Всероссийское"}
PLAN_RU = {"none": "Не включено", "ekp": "ЕКП Минспорта России", "regional": "Календарный план Оренбургской области"}


def _years(years: list[int] | None) -> list[int]:
    ys = sorted(set(years or default_years()))
    if len(ys) < 2:
        raise HTTPException(422, "Динамика строится минимум за 2 года")
    return ys


@router.get("/reports/headcount")
def headcount_report(db: DB, _: ReaderPrincipal, years: list[int] | None = Query(None)):
    return headcount(db, _years(years))


@router.get("/reports/headcount.xlsx")
def headcount_xlsx(db: DB, _: ReaderPrincipal, years: list[int] | None = Query(None)):
    ys = _years(years)
    data = headcount(db, ys)
    cols = ["Показатель", *[str(y) for y in ys], f"Изменение {ys[0]}–{ys[-1]}, %"]
    sheets = {"Итого": (cols, [("Всего занимающихся", *[data["total"][y] for y in ys], change_pct(data["total"], ys))])}
    for key, title in SLICES.items():
        sheets[title] = (cols, [(r["name"], *[r["values"][y] for y in ys], change_pct(r["values"], ys)) for r in data["slices"][key]])
    title = "Численность занимающихся спортивным программированием в Оренбургской области"
    return docs.file_response(docs.xlsx_bytes(sheets, title), f"headcount_{ys[0]}_{ys[-1]}.xlsx")


def _can_see_athlete(db: DB, p, athlete_id: int) -> bool:
    if p.id == athlete_id or p.role in (Role.ADMIN, Role.MINISTRY):
        return True
    if p.role == Role.COACH:
        return bool(db.scalar(select(CoachAthleteLink.id).where(
            CoachAthleteLink.coach_id == p.id, CoachAthleteLink.athlete_id == athlete_id,
            CoachAthleteLink.status.in_([LinkStatus.ACTIVE, LinkStatus.SUSPENDED]),
        )))
    return False


@router.get("/athletes/{athlete_id}/participation.{fmt}")
def participation_report(athlete_id: int, fmt: str, db: DB, p: CurrentPrincipal, year: int | None = None):
    if not _can_see_athlete(db, p, athlete_id):
        raise HTTPException(403, "Нет доступа к данным спортсмена")
    athlete = db.get(User, athlete_id)
    if athlete is None:
        raise HTTPException(404, "Спортсмен не найден")
    items = [h for h in results_history(db, athlete_id) if year is None or h.start_date.year == year]
    cols = ["№", "Соревнование", "Дисциплина", "Статус", "Дата", "Место", "Участников", "Баллы"]
    rows = [(i, h.competition_title, h.discipline, LEVEL_RU[h.level.value], f"{h.start_date:%d.%m.%Y}",
             h.place or "-", h.participants, h.score) for i, h in enumerate(items, 1)]
    period = f" за {year} год" if year else ""
    if fmt == "xlsx":
        return docs.file_response(docs.xlsx_bytes({"Выступления": (cols, rows)}, f"{athlete.full_name}: участие в соревнованиях{period}"),
                                  f"participation_{athlete_id}.xlsx")
    if fmt != "docx":
        raise HTTPException(404, "Поддерживаются xlsx и docx")
    prof = athlete.athlete
    doc = docs.new_doc(f"ОТЧЁТ о соревнованиях, в которых участвовал спортсмен{period}", [
        f"Спортсмен: {athlete.full_name}, {athlete.birth_date:%d.%m.%Y} г. р." if athlete.birth_date else f"Спортсмен: {athlete.full_name}",
        f"Организация: {prof.organization.name if prof and prof.organization else 'без организации'}",
    ])
    docs.add_table(doc, cols, rows)
    docs.signature(doc, "Председатель регионального отделения")
    return docs.file_response(docs.docx_bytes(doc), f"participation_{athlete_id}.docx")




class IndicatorDoc(BaseModel):
    id: int
    indicator: str
    year: int
    title: str
    filename: str


@router.get("/indicators")
def indicators(db: DB, _: ReaderPrincipal, year: int | None = None):
    year = year or date.today().year
    ys = [year - 2, year - 1, year]
    hc = headcount(db, ys)
    orgs = db.scalars(select(Organization).where(Organization.conducts_sport_training).order_by(Organization.name)).all()
    comps = db.scalars(
        select(Competition)
        .where(Competition.status == CompetitionStatus.COMPLETED, Competition.start_date.between(date(year, 1, 1), date(year, 12, 31)))
        .order_by(Competition.start_date)
    ).all()
    docs_ = db.scalars(select(IndicatorDocument).where(IndicatorDocument.year == year)).all()
    by_ind = lambda key: [IndicatorDoc.model_validate(d, from_attributes=True) for d in docs_ if d.indicator == key]
    return {
        "year": year,
        "headcount": {
            "source": "Реестр занимающихся: профиль спортсмена (год начала занятий, организация, дисциплины)",
            "years": ys,
            "total": hc["total"],
            "change_pct": change_pct(hc["total"], ys),
            "documents": by_ind("headcount"),
        },
        "organizations": {
            "source": "Карточки организаций: лицензия и реализуемые программы спортивной подготовки",
            "items": [
                {"id": o.id, "name": o.name, "municipality": o.municipality.name, "license": o.license_number,
                 "programs": sorted({f"{p.discipline.name}: {p.stage.value.upper()}" for p in o.programs})}
                for o in orgs
            ],
            "documents": by_ind("organizations"),
        },
        "competitions": {
            "source": "Календарь соревнований и опубликованные протоколы",
            "items": [
                {"id": c.id, "title": c.title, "date": c.start_date, "level": LEVEL_RU[c.level.value],
                 "plan": PLAN_RU[c.calendar_plan.value], "plan_number": c.calendar_plan_number,
                 "participants": len([r for r in c.results if r.place])}
                for c in comps
            ],
            "in_plans": sum(1 for c in comps if c.calendar_plan != CalendarPlan.NONE),
            "documents": by_ind("competitions"),
        },
    }


@router.post("/indicators/documents", response_model=IndicatorDoc, status_code=201)
async def upload_indicator_doc(
    db: DB, p: AdminPrincipal, file: UploadFile, indicator: str = Form(...), year: int = Form(...), title: str = Form(...),
):
    if indicator not in ("headcount", "organizations", "competitions"):
        raise HTTPException(422, "Неизвестный показатель")
    folder = settings.storage_dir / "indicators"
    folder.mkdir(parents=True, exist_ok=True)
    d = IndicatorDocument(indicator=indicator, year=year, title=title, filename=file.filename or "file", stored_as="")
    db.add(d)
    db.flush()
    d.stored_as = f"{d.id}_{(file.filename or 'file').replace('/', '_')}"
    (folder / d.stored_as).write_bytes(await file.read())
    log_action(db, p, "upload", "indicator_document", d.id, indicator=indicator)
    db.commit()
    return IndicatorDoc.model_validate(d, from_attributes=True)


@router.get("/indicators/documents/{doc_id}")
def download_indicator_doc(doc_id: int, db: DB, _: ReaderPrincipal):
    d = db.get(IndicatorDocument, doc_id)
    if d is None:
        raise HTTPException(404, "Документ не найден")
    return FileResponse(settings.storage_dir / "indicators" / d.stored_as, filename=d.filename)
