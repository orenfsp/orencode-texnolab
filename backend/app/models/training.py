
from datetime import date, datetime

from sqlalchemy import Column, ForeignKey, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .base import TZDateTime, enum_col, utcnow
from .dictionaries import Discipline, Organization
from .enums import CompetitionFormat, Gender, NormDirection, NormKind, TrainingStage
from .users import User


class TrainingGroup(Base):
    __tablename__ = "training_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id"))
    stage: Mapped[TrainingStage] = mapped_column(enum_col(TrainingStage))
    coach_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(100))
    year: Mapped[int]

    organization: Mapped[Organization] = relationship(lazy="joined")
    discipline: Mapped[Discipline] = relationship(lazy="joined")
    coach: Mapped[User] = relationship()
    members: Mapped[list["GroupMember"]] = relationship(back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):

    __tablename__ = "group_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("training_groups.id", ondelete="CASCADE"))
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    enrolled_at: Mapped[date]
    left_at: Mapped[date | None]
    reason: Mapped[str | None] = mapped_column(String(200))

    group: Mapped[TrainingGroup] = relationship(back_populates="members")
    athlete: Mapped[User] = relationship()


session_attendance = Table(
    "session_attendance",
    Base.metadata,
    Column("session_id", ForeignKey("training_sessions.id", ondelete="CASCADE"), primary_key=True),
    Column("athlete_id", ForeignKey("users.id"), primary_key=True),
)


class TrainingSession(Base):

    __tablename__ = "training_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("training_groups.id", ondelete="CASCADE"))
    held_on: Mapped[date]
    format: Mapped[CompetitionFormat] = mapped_column(enum_col(CompetitionFormat))
    topic: Mapped[str] = mapped_column(String(300))
    hours: Mapped[float] = mapped_column(default=2)
    confirmation_url: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    group: Mapped[TrainingGroup] = relationship()
    attendees: Mapped[list[User]] = relationship(secondary=session_attendance)


class NormStandard(Base):

    __tablename__ = "norm_standards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[NormKind] = mapped_column(enum_col(NormKind))
    stage: Mapped[TrainingStage] = mapped_column(enum_col(TrainingStage))
    discipline_id: Mapped[int | None] = mapped_column(ForeignKey("disciplines.id"))
    gender: Mapped[Gender | None] = mapped_column(enum_col(Gender))
    threshold: Mapped[float]
    unit: Mapped[str] = mapped_column(String(32))
    direction: Mapped[NormDirection] = mapped_column(enum_col(NormDirection))

    discipline: Mapped[Discipline | None] = relationship(lazy="joined")

    def is_passed(self, value: float) -> bool:
        return value >= self.threshold if self.direction == NormDirection.HIGHER_BETTER else value <= self.threshold


class NormResult(Base):
    __tablename__ = "norm_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    standard_id: Mapped[int] = mapped_column(ForeignKey("norm_standards.id"))
    value: Mapped[float]
    passed: Mapped[bool]
    taken_on: Mapped[date]
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    standard: Mapped[NormStandard] = relationship(lazy="joined")
    athlete: Mapped[User] = relationship(foreign_keys=[athlete_id])


class Attestation(Base):

    __tablename__ = "attestations"
    __table_args__ = (UniqueConstraint("athlete_id", "to_stage"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    from_stage: Mapped[TrainingStage | None] = mapped_column(enum_col(TrainingStage))
    to_stage: Mapped[TrainingStage] = mapped_column(enum_col(TrainingStage))
    decided_on: Mapped[date]
    decided_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
