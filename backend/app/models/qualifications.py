
from datetime import date, datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .base import TZDateTime, enum_col, utcnow
from .dictionaries import Discipline, JudgeCategory, SportRank
from .enums import RequestKind, RequestStatus
from .users import User


class AthleteRank(Base):

    __tablename__ = "athlete_ranks"

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id"))
    rank_id: Mapped[int] = mapped_column(ForeignKey("sport_ranks.id"))
    assigned_at: Mapped[date]
    order_number: Mapped[str] = mapped_column(String(64))
    valid_until: Mapped[date | None]
    basis_result_id: Mapped[int | None] = mapped_column(ForeignKey("results.id"))
    request_id: Mapped[int | None] = mapped_column(ForeignKey("rank_requests.id"))

    athlete: Mapped[User] = relationship()
    discipline: Mapped[Discipline] = relationship()
    rank: Mapped[SportRank] = relationship(lazy="joined")


class RankRequest(Base):

    __tablename__ = "rank_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    submitted_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id"))
    rank_id: Mapped[int] = mapped_column(ForeignKey("sport_ranks.id"))
    kind: Mapped[RequestKind] = mapped_column(enum_col(RequestKind))
    result_id: Mapped[int] = mapped_column(ForeignKey("results.id"))
    status: Mapped[RequestStatus] = mapped_column(enum_col(RequestStatus), default=RequestStatus.SUBMITTED)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    athlete: Mapped[User] = relationship(foreign_keys=[athlete_id])
    rank: Mapped[SportRank] = relationship()


class JudgeQualification(Base):

    __tablename__ = "judge_qualifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    judge_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("judge_categories.id"))
    assigned_at: Mapped[date]
    order_number: Mapped[str] = mapped_column(String(64))
    valid_until: Mapped[date | None]

    judge: Mapped[User] = relationship()
    category: Mapped[JudgeCategory] = relationship(lazy="joined")


class JudgeCategoryRequest(Base):
    __tablename__ = "judge_category_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    judge_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("judge_categories.id"))
    kind: Mapped[RequestKind] = mapped_column(enum_col(RequestKind))
    justification: Mapped[str | None] = mapped_column(Text)
    status: Mapped[RequestStatus] = mapped_column(enum_col(RequestStatus), default=RequestStatus.SUBMITTED)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    judge: Mapped[User] = relationship()
    category: Mapped[JudgeCategory] = relationship()


class Disqualification(Base):

    __tablename__ = "disqualifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    athlete_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    date_from: Mapped[date]
    date_to: Mapped[date | None]
    reason: Mapped[str] = mapped_column(Text)

    def is_active_on(self, d: date) -> bool:
        return self.date_from <= d and (self.date_to is None or d <= self.date_to)
