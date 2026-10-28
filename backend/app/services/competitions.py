
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    Competition,
    CompetitionLevel,
    CompetitionStatus,
    CompetitionType,
    RatingLevel,
    User,
)


def infer_rating_level(level: CompetitionLevel, ctype: CompetitionType) -> RatingLevel:
    if level == CompetitionLevel.REGIONAL:
        return RatingLevel.REGIONAL
    if level == CompetitionLevel.INTERREGIONAL:
        return RatingLevel.INTERREGIONAL
    name = ctype.name.lower()
    if "чемпионат" in name:
        return RatingLevel.RUS_CHAMPIONSHIP
    if "первенство" in name or ctype.is_youth:
        return RatingLevel.RUS_YOUTH
    return RatingLevel.INTERREGIONAL


def check_eligibility(comp: Competition, athlete: User) -> tuple[bool, str | None]:
    age = athlete.age_in_year(comp.start_date.year)
    if age is None:
        return False, "В профиле не указана дата рождения"
    if not comp.age_group.accepts(age):
        return False, f"Возрастная группа «{comp.age_group.name}», а спортсмену в {comp.start_date.year} г. исполняется {age}"
    return True, None


def registration_problem(comp: Competition, today: date | None = None) -> str | None:
    today = today or date.today()
    if comp.status != CompetitionStatus.REGISTRATION_OPEN:
        return "Приём заявок закрыт"
    if comp.registration_deadline and today > comp.registration_deadline:
        return "Срок подачи заявок истёк"
    return None


def get_type(db: Session, type_id: int) -> CompetitionType | None:
    return db.scalar(select(CompetitionType).where(CompetitionType.id == type_id))
