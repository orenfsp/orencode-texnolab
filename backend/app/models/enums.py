from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    ATHLETE = "athlete"
    COACH = "coach"
    JUDGE = "judge"
    MINISTRY = "ministry"


class Gender(StrEnum):
    MALE = "male"
    FEMALE = "female"


class OrgType(StrEnum):
    SCHOOL = "school"
    COLLEGE = "college"
    UNIVERSITY = "university"
    SPORT_SCHOOL = "sport_school"
    CLUB = "club"
    OTHER = "other"


class TrainingStage(StrEnum):
    NP = "np"
    UTE = "ute"
    SSM = "ssm"
    VSM = "vsm"


class CompetitionLevel(StrEnum):
    REGIONAL = "regional"
    INTERREGIONAL = "interregional"
    ALL_RUSSIAN = "all_russian"


class CompetitionFormat(StrEnum):
    OFFLINE = "offline"
    ONLINE = "online"
    MIXED = "mixed"


class CompetitionStatus(StrEnum):
    DRAFT = "draft"
    REGISTRATION_OPEN = "registration_open"
    REGISTRATION_CLOSED = "registration_closed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CalendarPlan(StrEnum):
    NONE = "none"
    EKP = "ekp"
    REGIONAL = "regional"


class RatingLevel(StrEnum):

    RUS_CHAMPIONSHIP = "rus_championship"
    RUS_YOUTH = "rus_youth"
    INTERREGIONAL = "interregional"
    REGIONAL = "regional"
    NONE = "none"


class ApplicationStatus(StrEnum):
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class LinkStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ENDED = "ended"
    DECLINED = "declined"


class RequestKind(StrEnum):
    ASSIGN = "assign"
    CONFIRM = "confirm"


class RequestStatus(StrEnum):
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class ConsentKind(StrEnum):
    PD_SELF = "pd_self"
    PD_GUARDIAN = "pd_guardian"


class AppealStatus(StrEnum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class ViolationDecision(StrEnum):
    PENDING = "pending"
    NO_VIOLATION = "no_violation"
    WARNING = "warning"
    TECHNICAL_DEFEAT = "technical_defeat"
    DISQUALIFICATION = "disqualification"


class PetitionStatus(StrEnum):
    PREPARED = "prepared"
    SENT = "sent"
    AWARDED = "awarded"


class TeamStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"


class TeamMemberRole(StrEnum):
    MAIN = "main"
    RESERVE = "reserve"


class NormDirection(StrEnum):
    HIGHER_BETTER = "higher_better"
    LOWER_BETTER = "lower_better"


class NormKind(StrEnum):
    GENERAL = "general"
    SPECIAL = "special"
