from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from .models import (
    ApplicationStatus,
    CalendarPlan,
    CompetitionFormat,
    CompetitionLevel,
    CompetitionStatus,
    Gender,
    RatingLevel,
    Role,
)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)




class LoginIn(BaseModel):
    email: str
    password: str


class SwitchRoleIn(BaseModel):
    role: Role


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    active_role: Role
    roles: list[Role]


class RegisterIn(BaseModel):

    email: EmailStr
    password: str = Field(min_length=8)
    last_name: str
    first_name: str
    middle_name: str | None = None
    birth_date: date
    gender: Gender
    municipality_id: int
    organization_id: int | None = None
    discipline_ids: list[int] = Field(min_length=1)
    start_year: int
    consent_pd: bool
    guardian_name: str | None = None
    guardian_phone: str | None = None
    guardian_consent: bool = False

    @model_validator(mode="after")
    def check_consents(self):
        if not self.consent_pd:
            raise ValueError("Необходимо согласие на обработку персональных данных")
        today = date.today()
        age = today.year - self.birth_date.year - (
            (today.month, today.day) < (self.birth_date.month, self.birth_date.day)
        )
        if age < 18 and not (self.guardian_name and self.guardian_consent):
            raise ValueError("Для несовершеннолетнего нужно согласие законного представителя")
        return self


class MeOut(BaseModel):
    id: int
    email: str
    full_name: str
    roles: list[Role]
    active_role: Role
    birth_date: date | None




class DictItem(ORM):
    id: int
    name: str
    code: str | None = None


class AgeGroupOut(ORM):
    id: int
    code: str
    name: str
    min_age: int
    max_age: int | None


class DictionariesOut(BaseModel):
    disciplines: list[DictItem]
    municipalities: list[DictItem]
    organizations: list[DictItem]
    competition_types: list[DictItem]
    age_groups: list[AgeGroupOut]
    sport_ranks: list[DictItem]
    judge_categories: list[DictItem]
    judge_positions: list[DictItem]




class CompetitionIn(BaseModel):
    title: str
    discipline_id: int
    type_id: int
    level: CompetitionLevel
    rating_level: RatingLevel | None = None
    age_group_id: int
    format: CompetitionFormat
    format_details: str | None = None
    venue: str | None = None
    start_date: date
    end_date: date
    registration_deadline: date | None = None
    calendar_plan: CalendarPlan = CalendarPlan.NONE
    calendar_plan_number: str | None = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Дата окончания раньше даты начала")
        if self.registration_deadline and self.registration_deadline > self.end_date:
            raise ValueError("Приём заявок не может закончиться после соревнования")
        if self.calendar_plan != CalendarPlan.NONE and not self.calendar_plan_number:
            raise ValueError("Укажите номер в календарном плане")
        return self


class CompetitionOut(ORM):
    id: int
    title: str
    discipline: DictItem
    type: DictItem
    level: CompetitionLevel
    rating_level: RatingLevel
    age_group: AgeGroupOut
    format: CompetitionFormat
    format_details: str | None
    venue: str | None
    start_date: date
    end_date: date
    registration_deadline: date | None
    status: CompetitionStatus
    calendar_plan: CalendarPlan
    calendar_plan_number: str | None
    has_regulation: bool = False
    applications_count: int = 0
    my_application_status: ApplicationStatus | None = None
    eligible: bool | None = None
    eligibility_note: str | None = None


class ApplicationIn(BaseModel):
    athlete_id: int | None = None


class ApplicationDecisionIn(BaseModel):
    comment: str | None = None


class ApplicationOut(ORM):
    id: int
    competition_id: int
    competition_title: str
    athlete_id: int
    athlete_name: str
    athlete_birth_year: int | None
    organization: str | None
    submitted_by_name: str
    submitted_as: Role
    status: ApplicationStatus
    comment: str | None
    created_at: datetime


class ResultIn(BaseModel):
    athlete_id: int
    score: float | None = None
    place: int | None = Field(default=None, ge=1)
    note: str | None = None


class ProtocolRow(BaseModel):
    place: int | None
    athlete_id: int
    full_name: str
    birth_year: int | None
    municipality: str | None
    organization: str | None
    rank: str | None
    score: float | None
    note: str | None
    result_id: int | None = None
    evsk_hint: str | None = None


class JudgeRow(BaseModel):
    full_name: str
    position: str
    category: str | None


class ProtocolOut(BaseModel):
    competition: CompetitionOut
    number: str | None
    published_at: datetime | None
    rows: list[ProtocolRow]
    judges: list[JudgeRow]


class HistoryItem(BaseModel):
    result_id: int
    competition_id: int
    competition_title: str
    start_date: date
    level: CompetitionLevel
    discipline: str
    place: int | None
    score: float | None
    participants: int
    protocol_url: str
    evsk_hint: str | None = None


class NotificationOut(ORM):
    id: int
    title: str
    body: str
    link: str | None
    created_at: datetime
    read_at: datetime | None
