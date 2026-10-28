# Модель данных и API

57 таблиц, SQLAlchemy 2 (`backend/app/models/`). Схема одинаково работает на SQLite и PostgreSQL: перечисления хранятся строками.

## Люди и роли (`users.py`)

```
User ─┬─< UserRole (admin | athlete | coach | judge | ministry)   один аккаунт - несколько ролей
      ├── AthleteProfile ─>< Discipline (athlete_disciplines)
      │     organization?, start_year, left_year?, training_stage?, законный представитель, РУСАДА
      ├── CoachProfile (organization), JudgeProfile
      ├─< Consent (pd_self | pd_guardian, редакция, дата, отзыв)      согласия по 152-ФЗ
      └─< Notification (кабинет + отметка доставки во внешний канал)

CoachAthleteLink (coach, athlete, discipline, status: pending|active|suspended|ended|declined) ─< CoachLinkEvent
```

## Справочники (`dictionaries.py`)

Пополняемые федерацией:

- `Discipline` (6 дисциплин), `Municipality`, `CompetitionType`, `AgeGroup` (min/max возраст).
- `SportRank` (уровень и срок действия), `JudgeCategory`, `JudgePosition`.
- `Organization` и `OrgProgram` - карточка Д3: лицензия и программы по дисциплинам и этапам.
- `RatingPointRule` - баллы рейтинга (уровень × место).
- `EvskNorm` - разрядные требования для подсветки.
- `PrizeRule` - размеры премий (Д8).

## Соревнования (`competitions.py`)

```
Competition: discipline, type, level (regional|interregional|all_russian), rating_level, age_group,
             format (offline|online|mixed) + format_details, venue, dates, registration_deadline,
             status: draft → registration_open ⇄ registration_closed → completed | cancelled,
             calendar_plan (none|ekp|regional) + number, regulation_file
  ├─< Application (athlete, submitted_by, submitted_as, status, comment)
  ├─< JudgeAssignment (judge, position)                  судейская коллегия
  ├─< Result (athlete, score, place, place_manual, note)
  └── Protocol (number, published_at)
```

## Квалификации (`qualifications.py`)

- `AthleteRank`: разряд, дата, приказ, срок действия; `basis_result` - за что получен.
- `RankRequest`: заявка на присвоение или подтверждение со ссылкой на результат.
- `JudgeQualification` и `JudgeCategoryRequest` - то же для судейских категорий.
- `Disqualification`: такие спортсмены исключаются из рейтинга и премий.

## Дополнительные сценарии

| Модуль | Сущности |
|---|---|
| `extras.py` | `NationalTeam` + `TeamMember` (сборная, снимок рейтинга); `ParticipationCertificate` (Д10, номер и код проверки); `Appeal`, `Violation`, `Evidence`, `CaseEvent` (Д5, история шагов); `PrizePetition` (Д8); `IndicatorDocument` (Д6); `ReminderLog` (без дублей напоминаний) |
| `training.py` | `TrainingGroup`, `GroupMember` (зачисление и перевод), `TrainingSession` + посещаемость (Д3); `NormStandard`, `NormResult`, `Attestation` (Д4) |
| `integrations.py` | `OAuthClient`, `OAuthCode`, `OAuthConsent` (Д1); `ApiToken`, `Webhook`, `WebhookDelivery` (Д2) |
| `system.py` | `AuditLog` (кто, когда, что), `Setting` (коэффициент стабильности, сроки отчётов) |

## Ключевые правила

- **Права.** Проверяются по активной роли из JWT. Смена кабинета: `POST /api/auth/switch-role` выпускает новый токен без пароля.
- **История выступлений.** Это `Result` соревнований в статусе `completed`; после публикации протокола результат появляется в истории сам.
- **Протокол.** В него входят все одобренные участники. Места считаются по убыванию баллов, при равных баллах место одинаковое (1, 1, 3). Ручное место не пересчитывается.
- **Допуск по возрасту.** Возраст = год соревнования − год рождения, он должен попадать в возрастную группу.
- **Рейтинг.** Сумма баллов сезона по `RatingPointRule`. Коэффициент ×1,2 при 2+ призовых местах. Дисквалифицированные исключаются. По каждому спортсмену виден расчёт.
- **Численность.** Спортсмен учитывается в году Y, если `start_year ≤ Y ≤ left_year`. Разрезы: организации, дисциплины, возрастные группы, муниципалитеты, этапы (из групп Д3).
- **Сроки.** Напоминания рассылаются за 30, 7 и 1 день: фоновая задача раз в 6 часов и при старте. Повторно не отправляются (`ReminderLog`). Перекрытый более высоким разрядом разряд не порождает предупреждений.

## API

Полная спецификация - Swagger `http://localhost:8000/docs`. Внешний API, вебхуки и ФСП ID описаны в [integrations.md](integrations.md).

| Группа | Основные эндпоинты |
|---|---|
| Авторизация | `POST /api/auth/login`, `/switch-role`, `/register`; `GET /api/auth/me` |
| Профиль | `GET/PUT /api/me/profile`, `PUT /api/me/antidoping`, `GET /api/me/consents/{id}.docx` |
| Связи | `GET /api/coach/search`, `POST /api/coach/links`, `GET /api/me/links`, `POST /api/links/{id}/status` |
| Календарь | `GET/POST /api/competitions`, `PUT /{id}`, `POST /{id}/status`, `POST/GET /{id}/regulation` |
| Заявки | `GET/POST /api/competitions/{id}/applications`, `POST /api/applications/{id}/approve\|reject\|withdraw` |
| Коллегия | `GET/POST /api/competitions/{id}/judges`, `DELETE /{id}/judges/{a}`, `GET /{id}/judges.docx` |
| Результаты | `PUT /api/competitions/{id}/results`, `POST /{id}/protocol/publish`, `GET /{id}/protocol[.xlsx\|.docx]` |
| Разряды | `POST /api/rank-requests`, `GET /api/me/rank-requests`, `GET /api/admin/rank-requests`, `POST /api/admin/rank-requests/{id}/approve\|reject`, `GET /api/admin/ranks`, `GET /api/admin/rank-candidates` |
| Судьи | `GET /api/admin/registry/judges`, `POST /api/admin/judges/{id}/qualification`, `GET /api/me/judge`, `POST /api/me/judge-requests`, `POST /api/admin/judge-requests/{id}/approve\|reject`, `GET /api/judges/{id}/report.docx\|xlsx` |
| Сроки | `GET /api/me/deadlines`, `POST /api/admin/reminders/run` |
| Реестр и отчёты | `GET /api/admin/registry/athletes\|coaches\|organizations`, `GET /api/reports/headcount[.xlsx]`, `GET /api/athletes/{id}/participation.docx\|xlsx` |
| Рейтинг и сборная | `GET /api/rating`, `GET/PUT /api/admin/settings/rating`, `GET/POST /api/admin/disqualifications`, `GET/POST /api/teams`, `PUT /api/teams/{id}/members`, `POST /{id}/approve`, `GET /{id}/list.docx\|xlsx`, `GET /{id}/order.docx` |
| Д3–Д4 | `GET /api/organizations/{id}`, `POST/PUT /api/admin/organizations`, `GET/POST /api/groups`, `POST /api/groups/{id}/members\|sessions`, `POST /api/groups/{id}/members/{a}/transfer`, `GET/POST/PUT /api/norms/standards`, `POST /api/norms/results`, `GET /api/norms/readiness`, `GET /api/athletes/{id}/norms`, `POST /api/attestations` |
| Д5 | `POST/GET /api/appeals`, `POST /api/appeals/{id}/decision`, `POST/GET /api/violations`, `POST /api/violations/{id}/decision`, `GET /api/evidence/{id}` |
| Д6 | `GET /api/indicators`, `POST /api/indicators/documents`, `GET /api/indicators/documents/{id}` |
| Д7, Д11 | `GET /api/me/path`, `GET /api/public/overview` |
| Д8 | `GET /api/prizes/candidates`, `GET/PUT /api/admin/settings/prizes`, `POST/GET /api/prizes/petitions`, `POST /{id}/status`, `GET /{id}.docx` |
| Д10 | `POST/GET /api/me/certificates`, `GET /api/certificates/{id}.docx`, `GET /api/public/certificates/{code}` |
| Уведомления | `GET /api/notifications`, `POST /{id}/read`, `POST /read-all` |
| Журнал | `GET /api/admin/audit` |
