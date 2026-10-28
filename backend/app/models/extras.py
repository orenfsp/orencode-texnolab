
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .base import TZDateTime, enum_col, utcnow
from .competitions import Competition, Result
from .dictionaries import AgeGroup, Discipline
from .enums import AppealStatus, PetitionStatus, TeamMemberRole, TeamStatus, ViolationDecision
from .users import User


class NationalTeam(Base):

    __tablename__ = "national_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id"))
    season: Mapped[int]
    age_group_id: Mapped[int | None] = mapped_column(ForeignKey("age_groups.id"))
    status: Mapped[TeamStatus] = mapped_column(enum_col(TeamStatus), default=TeamStatus.DRAFT)
    order_number: Mapped[str | None] = mapped_column(String(64))
    order_date: Mapped[date | None]
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    discipline: Mapped[Discipline] = relationship(lazy="joined")
    age_group: Mapped[AgeGroup | None] = relationship(lazy="joined")
    members: Mapped[list["TeamMember"]] = relationship(
        back_populates="team", cascade="all, delete-orphan", order_by="TeamMember.position"
    )


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "athlete_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("national_teams.id", ondelete="CASCADE"))
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[TeamMemberRole] = mapped_column(enum_col(TeamMemberRole), default=TeamMemberRole.MAIN)
    position: Mapped[int] = mapped_column(default=0)
    rating_points: Mapped[float | None]

    team: Mapped[NationalTeam] = relationship(back_populates="members")
    athlete: Mapped[User] = relationship()


class ParticipationCertificate(Base):

    __tablename__ = "participation_certificates"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(32), unique=True)
    verify_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    result_id: Mapped[int] = mapped_column(ForeignKey("results.id"))
    purpose: Mapped[str | None] = mapped_column(String(200))
    issued_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    athlete: Mapped[User] = relationship()
    result: Mapped[Result] = relationship()


class Appeal(Base):

    __tablename__ = "appeals"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"))
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    submitted_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[AppealStatus] = mapped_column(enum_col(AppealStatus), default=AppealStatus.SUBMITTED)
    decision: Mapped[str | None] = mapped_column(Text)
    new_score: Mapped[float | None]
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    competition: Mapped[Competition] = relationship()
    athlete: Mapped[User] = relationship(foreign_keys=[athlete_id])


class Violation(Base):

    __tablename__ = "violations"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"))
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reported_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    report: Mapped[str] = mapped_column(Text)
    decision: Mapped[ViolationDecision] = mapped_column(enum_col(ViolationDecision), default=ViolationDecision.PENDING)
    decision_text: Mapped[str | None] = mapped_column(Text)
    disqualification_until: Mapped[date | None]
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    competition: Mapped[Competition] = relationship()
    athlete: Mapped[User] = relationship(foreign_keys=[athlete_id])


class Evidence(Base):

    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(16))
    subject_id: Mapped[int] = mapped_column(index=True)
    filename: Mapped[str] = mapped_column(String(300))
    stored_as: Mapped[str] = mapped_column(String(300))
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class CaseEvent(Base):

    __tablename__ = "case_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(16))
    subject_id: Mapped[int] = mapped_column(index=True)
    status: Mapped[str] = mapped_column(String(32))
    comment: Mapped[str | None] = mapped_column(Text)
    by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class PrizePetition(Base):

    __tablename__ = "prize_petitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int]
    status: Mapped[PetitionStatus] = mapped_column(enum_col(PetitionStatus), default=PetitionStatus.PREPARED)
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    total_amount: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    awarded_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class IndicatorDocument(Base):

    __tablename__ = "indicator_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    indicator: Mapped[str] = mapped_column(String(32))
    year: Mapped[int]
    title: Mapped[str] = mapped_column(String(300))
    filename: Mapped[str] = mapped_column(String(300))
    stored_as: Mapped[str] = mapped_column(String(300))
    uploaded_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class ReminderLog(Base):

    __tablename__ = "reminder_log"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
