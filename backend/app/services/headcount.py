
from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AthleteProfile, GroupMember

AGE_BRACKETS = [("до 10 лет", 0, 9), ("10–13 лет", 10, 13), ("14–17 лет", 14, 17), ("18–24 года", 18, 24), ("25 лет и старше", 25, 200)]
STAGE_RU = {"np": "Начальная подготовка", "ute": "Учебно-тренировочный этап", "ssm": "Совершенствование спортивного мастерства", "vsm": "Высшее спортивное мастерство"}
SLICES = {
    "organization": "По организациям",
    "discipline": "По дисциплинам",
    "age_group": "По возрастным группам",
    "municipality": "По муниципалитетам",
    "stage": "По этапам спортивной подготовки",
}


def _bracket(age: int) -> str:
    return next(name for name, lo, hi in AGE_BRACKETS if lo <= age <= hi)


def _active(a: AthleteProfile, y: int) -> bool:
    return a.start_year <= y and (a.left_year is None or a.left_year >= y)


def headcount(db: Session, years: list[int]) -> dict:
    athletes = db.scalars(select(AthleteProfile)).all()
    members = db.scalars(select(GroupMember)).all()
    total = {y: 0 for y in years}
    slices: dict[str, dict[str, dict[int, int]]] = {k: defaultdict(lambda: {y: 0 for y in years}) for k in SLICES}
    for a in athletes:
        u = a.user
        for y in years:
            if not _active(a, y):
                continue
            total[y] += 1
            org = (a.organization.short_name or a.organization.name) if a.organization else "Без организации"
            slices["organization"][org][y] += 1
            for d in a.disciplines:
                slices["discipline"][d.name][y] += 1
            if u.birth_date:
                slices["age_group"][_bracket(y - u.birth_date.year)][y] += 1
            slices["municipality"][u.municipality.name if u.municipality else "Не указан"][y] += 1
    for m in members:
        for y in years:
            if m.enrolled_at.year <= y and (m.left_at is None or m.left_at.year >= y):
                slices["stage"][STAGE_RU[m.group.stage.value]][y] += 1
    order = {name: i for i, (name, _, _) in enumerate(AGE_BRACKETS)}
    result = {}
    for key, data in slices.items():
        rows = [{"name": name, "values": vals} for name, vals in data.items()]
        if key == "age_group":
            rows.sort(key=lambda r: order[r["name"]])
        else:
            rows.sort(key=lambda r: -r["values"][years[-1]])
        result[key] = rows
    return {"years": years, "total": total, "slices": result}


def change_pct(values: dict[int, int], years: list[int]) -> float | None:
    first, last = values[years[0]], values[years[-1]]
    return round((last - first) / first * 100, 1) if first else None


def default_years(today: date | None = None) -> list[int]:
    y = (today or date.today()).year
    return [y - 2, y - 1, y]
