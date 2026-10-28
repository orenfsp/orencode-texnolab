
from datetime import date, datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .base import TZDateTime, enum_col, utcnow
from .dictionaries import AgeGroup, CompetitionType, Discipline, JudgePosition
from .enums import (
    ApplicationStatus,
    CalendarPlan,
    CompetitionFormat,
    CompetitionLevel,
    CompetitionStatus,
    RatingLevel,
    Role,
)
from .users import User


class Competition(Base):
    __tablename__ = "competitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id"))
    type_id: Mapped[int] = mapped_column(ForeignKey("competition_types.id"))
    level: Mapped[CompetitionLevel] = mapped_column(enum_col(CompetitionLevel))
    rating_level: Mapped[RatingLevel] = mapped_column(enum_col(RatingLevel))
    age_group_id: Mapped[int] = mapped_column(ForeignKey("age_groups.id"))
    format: Mapped[CompetitionFormat] = mapped_column(enum_col(CompetitionFormat))
    format_details: Mapped[str | None] = mapped_column(Text)
    venue: Mapped[str | None] = mapped_column(String(300))
    start_date: Mapped[date]
    end_date: Mapped[date]
    registration_deadline: Mapped[date | None]
    status: Mapped[CompetitionStatus] = mapped_column(
        enum_col(CompetitionStatus), default=CompetitionStatus.DRAFT
    )
    calendar_plan: Mapped[CalendarPlan] = mapped_column(enum_col(CalendarPlan), default=CalendarPlan.NONE)
    calendar_plan_number: Mapped[str | None] = mapped_column(String(64))
    regulation_file: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    discipline: Mapped[Discipline] = relationship(lazy="joined")
    type: Mapped[CompetitionType] = relationship(lazy="joined")
    age_group: Mapped[AgeGroup] = relationship(lazy="joined")
    applications: Mapped[list["Application"]] = relationship(back_populates="competition")
    results: Mapped[list["Result"]] = relationship(back_populates="competition", cascade="all, delete-orphan")
    judges: Mapped[list["JudgeAssignment"]] = relationship(
        back_populates="competition", cascade="all, delete-orphan"
    )
    protocol: Mapped["Protocol | None"] = relationship(back_populates="competition", uselist=False)


class Application(Base):

    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("competition_id", "athlete_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"))
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    submitted_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    submitted_as: Mapped[Role] = mapped_column(enum_col(Role))
    status: Mapped[ApplicationStatus] = mapped_column(
        enum_col(ApplicationStatus), default=ApplicationStatus.SUBMITTED
    )
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    competition: Mapped[Competition] = relationship(back_populates="applications")
    athlete: Mapped[User] = relationship(foreign_keys=[athlete_id])
    submitted_by: Mapped[User] = relationship(foreign_keys=[submitted_by_id])


class JudgeAssignment(Base):

    __tablename__ = "judge_assignments"
    __table_args__ = (UniqueConstraint("competition_id", "judge_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"))
    judge_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    position_id: Mapped[int] = mapped_column(ForeignKey("judge_positions.id"))

    competition: Mapped[Competition] = relationship(back_populates="judges")
    judge: Mapped[User] = relationship()
    position: Mapped[JudgePosition] = relationship()


class Result(Base):

    __tablename__ = "results"
    __table_args__ = (UniqueConstraint("competition_id", "athlete_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"))
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    score: Mapped[float | None]
    place: Mapped[int | None]
    place_manual: Mapped[bool] = mapped_column(default=False)
    note: Mapped[str | None] = mapped_column(String(300))

    competition: Mapped[Competition] = relationship(back_populates="results")
    athlete: Mapped[User] = relationship()


class Protocol(Base):

    __tablename__ = "protocols"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"), unique=True)
    number: Mapped[str] = mapped_column(String(64))
    published_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    published_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    competition: Mapped[Competition] = relationship(back_populates="protocol")
