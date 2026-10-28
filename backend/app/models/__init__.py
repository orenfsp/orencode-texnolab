from .competitions import Application, Competition, JudgeAssignment, Protocol, Result
from .dictionaries import (
    AgeGroup,
    CompetitionType,
    Discipline,
    EvskNorm,
    JudgeCategory,
    JudgePosition,
    Municipality,
    Organization,
    OrgProgram,
    PrizeRule,
    RatingPointRule,
    SportRank,
)
from .enums import *
from .extras import (
    Appeal,
    CaseEvent,
    Evidence,
    IndicatorDocument,
    NationalTeam,
    ParticipationCertificate,
    PrizePetition,
    ReminderLog,
    TeamMember,
    Violation,
)
from .integrations import ApiToken, OAuthClient, OAuthCode, OAuthConsent, Webhook, WebhookDelivery
from .qualifications import AthleteRank, Disqualification, JudgeCategoryRequest, JudgeQualification, RankRequest
from .system import AuditLog, Notification, Setting
from .training import (
    Attestation,
    GroupMember,
    NormResult,
    NormStandard,
    TrainingGroup,
    TrainingSession,
    session_attendance,
)
from .users import (
    AthleteProfile,
    CoachAthleteLink,
    CoachLinkEvent,
    CoachProfile,
    Consent,
    JudgeProfile,
    User,
    UserRole,
    athlete_disciplines,
)
