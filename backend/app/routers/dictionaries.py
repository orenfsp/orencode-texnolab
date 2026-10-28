from fastapi import APIRouter
from sqlalchemy import select

from ..deps import DB
from ..models import (
    AgeGroup,
    CompetitionType,
    Discipline,
    JudgeCategory,
    JudgePosition,
    Municipality,
    Organization,
    SportRank,
)
from ..schemas import DictionariesOut

router = APIRouter(prefix="/api/dict", tags=["dictionaries"])


@router.get("", response_model=DictionariesOut)
def all_dictionaries(db: DB):
    return DictionariesOut(
        disciplines=db.scalars(select(Discipline).order_by(Discipline.sort)).all(),
        municipalities=db.scalars(select(Municipality).order_by(Municipality.name)).all(),
        organizations=db.scalars(select(Organization).order_by(Organization.name)).all(),
        competition_types=db.scalars(select(CompetitionType).where(CompetitionType.is_active)).all(),
        age_groups=db.scalars(select(AgeGroup).order_by(AgeGroup.min_age)).all(),
        sport_ranks=db.scalars(select(SportRank).order_by(SportRank.level)).all(),
        judge_categories=db.scalars(select(JudgeCategory).order_by(JudgeCategory.level)).all(),
        judge_positions=db.scalars(select(JudgePosition)).all(),
    )
