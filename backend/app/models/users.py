
from datetime import date, datetime

from sqlalchemy import Column, ForeignKey, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .base import TZDateTime, enum_col, utcnow
from .dictionaries import Discipline, Municipality, Organization
from .enums import ConsentKind, Gender, LinkStatus, Role, TrainingStage


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    last_name: Mapped[str] = mapped_column(String(100))
    first_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[str | None] = mapped_column(String(100))
    birth_date: Mapped[date | None]
    gender: Mapped[Gender | None] = mapped_column(enum_col(Gender))
    phone: Mapped[str | None] = mapped_column(String(32))
    municipality_id: Mapped[int | None] = mapped_column(ForeignKey("municipalities.id"))
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    municipality: Mapped[Municipality | None] = relationship()
    athlete: Mapped["AthleteProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.last_name, self.first_name, self.middle_name) if p)

    @property
    def role_set(self) -> set[Role]:
        return {r.role for r in self.roles}

    def age_in_year(self, year: int) -> int | None:
        return year - self.birth_date.year if self.birth_date else None


class UserRole(Base):

    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[Role] = mapped_column(enum_col(Role))

    user: Mapped[User] = relationship(back_populates="roles")


athlete_disciplines = Table(
    "athlete_disciplines",
    Base.metadata,
    Column("athlete_id", ForeignKey("athlete_profiles.user_id", ondelete="CASCADE"), primary_key=True),
    Column("discipline_id", ForeignKey("disciplines.id"), primary_key=True),
)


class AthleteProfile(Base):
    __tablename__ = "athlete_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"))
    start_year: Mapped[int]
    left_year: Mapped[int | None]
    training_stage: Mapped[TrainingStage | None] = mapped_column(enum_col(TrainingStage))
    guardian_name: Mapped[str | None] = mapped_column(String(200))
    guardian_phone: Mapped[str | None] = mapped_column(String(32))
    rusada_course_date: Mapped[date | None]
    rusada_certificate_url: Mapped[str | None] = mapped_column(String(500))

    user: Mapped[User] = relationship(back_populates="athlete")
    organization: Mapped[Organization | None] = relationship()
    disciplines: Mapped[list[Discipline]] = relationship(secondary=athlete_disciplines, lazy="selectin")


class CoachProfile(Base):
    __tablename__ = "coach_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"))

    user: Mapped[User] = relationship()
    organization: Mapped[Organization | None] = relationship()


class JudgeProfile(Base):
    __tablename__ = "judge_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

    user: Mapped[User] = relationship()


class Consent(Base):

    __tablename__ = "consents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[ConsentKind] = mapped_column(enum_col(ConsentKind))
    signed_by: Mapped[str] = mapped_column(String(200))
    text_version: Mapped[str] = mapped_column(String(32))
    signed_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class CoachAthleteLink(Base):

    __tablename__ = "coach_athlete_links"
    __table_args__ = (UniqueConstraint("coach_id", "athlete_id", "discipline_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    coach_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id"))
    status: Mapped[LinkStatus] = mapped_column(enum_col(LinkStatus), default=LinkStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    coach: Mapped[User] = relationship(foreign_keys=[coach_id])
    athlete: Mapped[User] = relationship(foreign_keys=[athlete_id])
    discipline: Mapped[Discipline] = relationship()
    events: Mapped[list["CoachLinkEvent"]] = relationship(
        back_populates="link", cascade="all, delete-orphan", order_by="CoachLinkEvent.at"
    )


class CoachLinkEvent(Base):

    __tablename__ = "coach_link_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("coach_athlete_links.id", ondelete="CASCADE"))
    status: Mapped[LinkStatus] = mapped_column(enum_col(LinkStatus))
    by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    comment: Mapped[str | None] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)

    link: Mapped[CoachAthleteLink] = relationship(back_populates="events")
