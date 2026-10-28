
from datetime import date

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .base import enum_col
from .enums import OrgType, RatingLevel, TrainingStage


class Discipline(Base):
    __tablename__ = "disciplines"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    sort: Mapped[int] = mapped_column(default=0)


class Municipality(Base):
    __tablename__ = "municipalities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300))
    short_name: Mapped[str | None] = mapped_column(String(100))
    type: Mapped[OrgType] = mapped_column(enum_col(OrgType))
    municipality_id: Mapped[int] = mapped_column(ForeignKey("municipalities.id"))
    conducts_sport_training: Mapped[bool] = mapped_column(default=False)
    license_number: Mapped[str | None] = mapped_column(String(64))
    license_date: Mapped[date | None]
    address: Mapped[str | None] = mapped_column(String(300))

    municipality: Mapped[Municipality] = relationship()
    programs: Mapped[list["OrgProgram"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class OrgProgram(Base):

    __tablename__ = "org_programs"
    __table_args__ = (UniqueConstraint("organization_id", "discipline_id", "stage"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id"))
    stage: Mapped[TrainingStage] = mapped_column(enum_col(TrainingStage))

    discipline: Mapped[Discipline] = relationship(lazy="joined")


class CompetitionType(Base):

    __tablename__ = "competition_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    is_youth: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)


class AgeGroup(Base):

    __tablename__ = "age_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    min_age: Mapped[int]
    max_age: Mapped[int | None]

    def accepts(self, age: int) -> bool:
        return age >= self.min_age and (self.max_age is None or age <= self.max_age)


class SportRank(Base):

    __tablename__ = "sport_ranks"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    level: Mapped[int]
    validity_years: Mapped[int | None]


class JudgeCategory(Base):
    __tablename__ = "judge_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    level: Mapped[int]
    validity_years: Mapped[int | None]


class JudgePosition(Base):
    __tablename__ = "judge_positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)


class RatingPointRule(Base):

    __tablename__ = "rating_point_rules"
    __table_args__ = (UniqueConstraint("rating_level", "place"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    rating_level: Mapped[RatingLevel] = mapped_column(enum_col(RatingLevel))
    place: Mapped[int]
    points: Mapped[float]


class EvskNorm(Base):

    __tablename__ = "evsk_norms"

    id: Mapped[int] = mapped_column(primary_key=True)
    rank_id: Mapped[int] = mapped_column(ForeignKey("sport_ranks.id"))
    rating_level: Mapped[RatingLevel] = mapped_column(enum_col(RatingLevel))
    max_place: Mapped[int]
    min_participants: Mapped[int] = mapped_column(default=1)

    rank: Mapped[SportRank] = relationship(lazy="joined")


class PrizeRule(Base):

    __tablename__ = "prize_rules"
    __table_args__ = (UniqueConstraint("rating_level", "place"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    rating_level: Mapped[RatingLevel] = mapped_column(enum_col(RatingLevel))
    place: Mapped[int]
    amount: Mapped[int]
