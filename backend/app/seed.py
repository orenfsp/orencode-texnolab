
import random
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, SessionLocal, engine
from .models import (
    AgeGroup,
    Appeal,
    AppealStatus,
    Attestation,
    CaseEvent,
    Disqualification,
    EvskNorm,
    GroupMember,
    NationalTeam,
    NormDirection,
    NormKind,
    NormResult,
    NormStandard,
    OAuthClient,
    OrgProgram,
    ParticipationCertificate,
    PrizeRule,
    TeamMember,
    TeamMemberRole,
    TrainingGroup,
    TrainingSession,
    Violation,
    Application,
    ApplicationStatus,
    AthleteProfile,
    AthleteRank,
    CalendarPlan,
    CoachAthleteLink,
    CoachLinkEvent,
    CoachProfile,
    Competition,
    CompetitionFormat,
    CompetitionLevel,
    CompetitionStatus,
    CompetitionType,
    Consent,
    ConsentKind,
    Discipline,
    Gender,
    JudgeAssignment,
    JudgeCategory,
    JudgeCategoryRequest,
    JudgePosition,
    JudgeProfile,
    JudgeQualification,
    LinkStatus,
    Municipality,
    Organization,
    OrgType,
    Protocol,
    RankRequest,
    RatingLevel,
    RatingPointRule,
    RequestKind,
    Result,
    Role,
    Setting,
    SportRank,
    TrainingStage,
    User,
    UserRole,
)
from .security import hash_password
from .services.dates import add_years
from .services.competitions import infer_rating_level
from .services.protocol import assign_places

PASSWORD = "demo1234"
TODAY = date.today()
rnd = random.Random(56)

DISCIPLINES = [
    ("algo", "Программирование алгоритмическое"),
    ("product", "Программирование продуктовое"),
    ("infosec", "Программирование систем информационной безопасности"),
    ("ai", "Программирование систем искусственного интеллекта"),
    ("robotics", "Программирование робототехники"),
    ("uas", "Программирование беспилотных авиационных систем"),
]
MUNICIPALITIES = [
    "г. Оренбург", "г. Орск", "г. Новотроицк", "г. Бузулук", "г. Бугуруслан",
    "г. Гай", "г. Медногорск", "г. Сорочинск", "Оренбургский район",
]
ORGANIZATIONS = [
    ("Оренбургский государственный университет", "ОГУ", OrgType.UNIVERSITY, 0),
    ("Лицей информационных технологий № 1", "ЛИТ № 1", OrgType.SCHOOL, 0),
    ("Спортивная школа «Цифровой старт»", "СШ «Цифровой старт»", OrgType.SPORT_SCHOOL, 0),
    ("Клуб спортивного программирования «Код56»", "Клуб «Код56»", OrgType.CLUB, 0),
    ("Орский индустриальный колледж", "ОИК", OrgType.COLLEGE, 1),
    ("Гимназия № 3 г. Орска", "Гимназия № 3", OrgType.SCHOOL, 1),
    ("Новотроицкий центр технического творчества", "ЦТТ Новотроицк", OrgType.OTHER, 2),
    ("Бузулукская школа № 7", "Школа № 7", OrgType.SCHOOL, 3),
]
COMPETITION_TYPES = [("Чемпионат", False), ("Первенство", True), ("Кубок", False), ("Турнир", False)]
AGE_GROUPS = [
    ("kids", "Мальчики, девочки (10–13 лет)", 10, 13),
    ("youth", "Юноши, девушки (14–17 лет)", 14, 17),
    ("juniors", "Юниоры, юниорки (16–24 года)", 16, 24),
    ("adults", "Мужчины, женщины (16 лет и старше)", 16, None),
]
RANKS = [
    ("y3", "3 юношеский разряд", 1, 2), ("y2", "2 юношеский разряд", 2, 2), ("y1", "1 юношеский разряд", 3, 2),
    ("s3", "3 спортивный разряд", 4, 2), ("s2", "2 спортивный разряд", 5, 2), ("s1", "1 спортивный разряд", 6, 3),
    ("kms", "Кандидат в мастера спорта", 7, 3), ("ms", "Мастер спорта России", 8, None),
]
JUDGE_CATEGORIES = [
    ("yss", "Юный спортивный судья", 1, 1), ("c3", "Спортивный судья третьей категории", 2, 2),
    ("c2", "Спортивный судья второй категории", 3, 2), ("c1", "Спортивный судья первой категории", 4, 4),
    ("vk", "Спортивный судья всероссийской категории", 5, 4),
]
JUDGE_POSITIONS = ["Главный судья", "Главный секретарь", "Заместитель главного судьи", "Судья", "Судья-эксперт"]
RATING_TABLE = {
    RatingLevel.RUS_CHAMPIONSHIP: (100, 80, 60),
    RatingLevel.RUS_YOUTH: (80, 60, 40),
    RatingLevel.INTERREGIONAL: (60, 45, 30),
    RatingLevel.REGIONAL: (40, 30, 20),
}

TRAINING_ORGS = {
    2: ("Л035-01248-56/00123456", "г. Оренбург, ул. Цифровая, 12", [("algo", "np"), ("algo", "ute"), ("algo", "ssm"), ("robotics", "np"), ("robotics", "ute")]),
    3: ("Л035-01248-56/00234567", "г. Оренбург, пр. Победы, 101", [("algo", "ute"), ("product", "ute"), ("infosec", "np")]),
    0: ("Л035-01248-56/00345678", "г. Оренбург, пр. Победы, 13", [("ai", "ssm"), ("product", "ssm"), ("algo", "vsm")]),
    6: ("Л035-01248-56/00456789", "г. Новотроицк, ул. Советская, 40", [("robotics", "np"), ("uas", "np")]),
}
EVSK = [
    ("rus_championship", "kms", 3, 1), ("rus_championship", "s1", 10, 1),
    ("rus_youth", "s1", 3, 1), ("rus_youth", "s2", 8, 1),
    ("interregional", "s1", 1, 8), ("interregional", "s2", 3, 1), ("interregional", "s3", 6, 1),
    ("regional", "s2", 1, 6), ("regional", "s3", 3, 1), ("regional", "y1", 6, 1),
]
PRIZES = {
    "rus_championship": (100000, 75000, 50000), "rus_youth": (60000, 45000, 30000),
    "interregional": (30000, 20000, 15000), "regional": (10000, 7000, 5000),
}
NORMS = [
    ("Бег 60 м", "general", "np", "male", 10.9, "с", "lower_better"),
    ("Бег 60 м", "general", "np", "female", 11.4, "с", "lower_better"),
    ("Скорость печати на клавиатуре", "special", "np", None, 100, "зн/мин", "higher_better"),
    ("Бег 60 м", "general", "ute", "male", 10.2, "с", "lower_better"),
    ("Бег 60 м", "general", "ute", "female", 10.9, "с", "lower_better"),
    ("Сгибание-разгибание рук в упоре лёжа", "general", "ute", "male", 20, "раз", "higher_better"),
    ("Сгибание-разгибание рук в упоре лёжа", "general", "ute", "female", 10, "раз", "higher_better"),
    ("Скорость печати на клавиатуре", "special", "ute", None, 160, "зн/мин", "higher_better"),
    ("Скорость печати на клавиатуре", "special", "ssm", None, 220, "зн/мин", "higher_better"),
    ("Наклон вперёд из положения стоя", "general", "ssm", None, 7, "см", "higher_better"),
]

MALE = ["Артём", "Максим", "Иван", "Дмитрий", "Кирилл", "Никита", "Егор", "Матвей", "Тимур", "Арсений", "Даниил", "Роман"]
FEMALE = ["Анна", "Мария", "Софья", "Алиса", "Виктория", "Полина", "Дарья", "Ксения", "Елизавета", "Арина"]
LAST = ["Смирнов", "Кузнецов", "Попов", "Волков", "Соколов", "Лебедев", "Козлов", "Новиков", "Морозов", "Павлов",
        "Семёнов", "Голубев", "Виноградов", "Богданов", "Воробьёв", "Фёдоров", "Михайлов", "Беляев", "Тарасов", "Белов"]
PATRONYMIC_M = ["Александрович", "Сергеевич", "Андреевич", "Олегович", "Игоревич", "Викторович"]
PATRONYMIC_F = ["Александровна", "Сергеевна", "Андреевна", "Олеговна", "Игоревна", "Викторовна"]


def female_last(name: str) -> str:
    return name + "а"


class Seeder:
    def __init__(self, db: Session):
        self.db = db
        self.pw = hash_password(PASSWORD)
        self.n_users = 0

    def add(self, obj):
        self.db.add(obj)
        return obj


    def dictionaries(self):
        db = self.db
        self.disc = {code: self.add(Discipline(code=code, name=name, sort=i)) for i, (code, name) in enumerate(DISCIPLINES)}
        self.mun = [self.add(Municipality(name=n)) for n in MUNICIPALITIES]
        db.flush()
        self.orgs = [
            self.add(Organization(name=n, short_name=s, type=t, municipality_id=self.mun[m].id))
            for n, s, t, m in ORGANIZATIONS
        ]
        self.ctype = {n: self.add(CompetitionType(name=n, is_youth=y)) for n, y in COMPETITION_TYPES}
        self.age = {c: self.add(AgeGroup(code=c, name=n, min_age=a, max_age=b)) for c, n, a, b in AGE_GROUPS}
        self.rank = {c: self.add(SportRank(code=c, name=n, level=l, validity_years=v)) for c, n, l, v in RANKS}
        self.jcat = {c: self.add(JudgeCategory(code=c, name=n, level=l, validity_years=v)) for c, n, l, v in JUDGE_CATEGORIES}
        self.jpos = {n: self.add(JudgePosition(name=n)) for n in JUDGE_POSITIONS}
        for level, points in RATING_TABLE.items():
            for place, pts in enumerate(points, start=1):
                self.add(RatingPointRule(rating_level=level, place=place, points=pts))
        self.add(Setting(key="stability_coefficient", value=1.2, description="Коэффициент стабильности рейтинга"))
        self.add(Setting(key="stability_min_podiums", value=2, description="Минимум призовых мест за сезон для коэффициента"))
        self.add(Setting(key="report_deadlines", description="Сроки отчётов федерации", value=[
            {"title": "Ходатайства на премии Губернатора", "month": 2, "day": 1, "link": "/admin/prizes"},
            {"title": "Годовой статистический отчёт 1-ФК в министерство", "month": 1, "day": 20, "link": "/admin/reports"},
            {"title": "Отчёт о проведённых соревнованиях за полугодие", "month": 7, "day": 10, "link": "/admin/reports"},
        ]))
        for idx, (lic, addr, programs) in TRAINING_ORGS.items():
            o = self.orgs[idx]
            o.conducts_sport_training, o.license_number, o.license_date, o.address = True, lic, date(2021, 9, 1), addr
            o.programs = [OrgProgram(discipline_id=self.disc[d].id, stage=TrainingStage(st)) for d, st in programs]
        db.flush()
        for level, rank, place, n in EVSK:
            self.add(EvskNorm(rank_id=self.rank[rank].id, rating_level=RatingLevel(level), max_place=place, min_participants=n))
        for level, amounts in PRIZES.items():
            for place, amount in enumerate(amounts, start=1):
                self.add(PrizeRule(rating_level=RatingLevel(level), place=place, amount=amount))
        self.norms = []
        for name, kind, stage, gender, thr, unit, direction in NORMS:
            self.norms.append(self.add(NormStandard(
                name=name, kind=NormKind(kind), stage=TrainingStage(stage), gender=Gender(gender) if gender else None,
                threshold=thr, unit=unit, direction=NormDirection(direction))))
        db.flush()


    def user(self, email, last, first, middle, birth, gender, roles, mun=None) -> User:
        self.n_users += 1
        u = self.add(
            User(
                email=email,
                password_hash=self.pw,
                last_name=last,
                first_name=first,
                middle_name=middle,
                birth_date=birth,
                gender=gender,
                phone=f"+7 900 000-{self.n_users // 100:02d}-{self.n_users % 100:02d}",
                municipality_id=(mun or self.mun[0]).id,
                roles=[UserRole(role=r) for r in roles],
            )
        )
        self.db.flush()
        self.add(Consent(user_id=u.id, kind=ConsentKind.PD_SELF, signed_by=u.full_name, text_version="2026-01"))
        return u

    def athlete_profile(self, u: User, org, disciplines, start_year, stage=None):
        minor = u.birth_date and (TODAY.year - u.birth_date.year) < 18
        u.athlete = AthleteProfile(
            organization_id=org.id if org else None,
            start_year=start_year,
            training_stage=stage,
            disciplines=disciplines,
            guardian_name=f"{u.last_name} (законный представитель)" if minor else None,
            guardian_phone="+7 900 111-11-11" if minor else None,
            rusada_course_date=date(TODAY.year, 1, 20) if rnd.random() < 0.6 else None,
            rusada_certificate_url="https://rusada.ru/education/online-training/" if rnd.random() < 0.6 else None,
        )
        if minor:
            self.add(Consent(user_id=u.id, kind=ConsentKind.PD_GUARDIAN, signed_by=u.athlete.guardian_name, text_version="2026-01"))

    def link(self, coach: User, athlete: User, disc: Discipline, status=LinkStatus.ACTIVE):
        l = self.add(CoachAthleteLink(coach_id=coach.id, athlete_id=athlete.id, discipline_id=disc.id, status=status))
        l.events.append(CoachLinkEvent(status=LinkStatus.PENDING, by_user_id=coach.id, comment="Запрос тренера"))
        if status != LinkStatus.PENDING:
            l.events.append(CoachLinkEvent(status=status, by_user_id=athlete.id, comment="Подтверждено спортсменом"))
        return l

    def people(self):
        algo, product, ai, robotics = self.disc["algo"], self.disc["product"], self.disc["ai"], self.disc["robotics"]
        self.admin = self.user("admin@fsp56.demo", "Орлова", "Наталья", "Викторовна", date(1985, 3, 14), Gender.FEMALE, [Role.ADMIN])
        self.user("ministry@fsp56.demo", "Степанов", "Олег", "Игоревич", date(1979, 9, 2), Gender.MALE, [Role.MINISTRY])

        self.coach = self.user("coach@fsp56.demo", "Лавров", "Андрей", "Сергеевич", date(1988, 6, 21), Gender.MALE, [Role.COACH, Role.JUDGE])
        self.add(CoachProfile(user_id=self.coach.id, organization_id=self.orgs[2].id))
        self.add(JudgeProfile(user_id=self.coach.id))

        self.judge = self.user("judge@fsp56.demo", "Крылова", "Елена", "Павловна", date(1982, 11, 5), Gender.FEMALE, [Role.JUDGE])
        self.add(JudgeProfile(user_id=self.judge.id))
        self.secretary = self.user("secretary@fsp56.demo", "Зайцев", "Павел", "Олегович", date(1995, 1, 30), Gender.MALE, [Role.JUDGE])
        self.add(JudgeProfile(user_id=self.secretary.id))

        self.athlete = self.user(
            "athlete@fsp56.demo", "Ветров", "Михаил", "Андреевич", date(TODAY.year - 16, 4, 12), Gender.MALE, [Role.ATHLETE]
        )
        self.athlete_profile(self.athlete, self.orgs[1], [algo, ai], TODAY.year - 3, TrainingStage.UTE)
        self.link(self.coach, self.athlete, algo)

        self.athlete_coach = self.user(
            "student@fsp56.demo", "Миронова", "Алина", "Олеговна", date(TODAY.year - 20, 8, 3), Gender.FEMALE, [Role.ATHLETE, Role.COACH]
        )
        self.athlete_profile(self.athlete_coach, self.orgs[0], [algo, product], TODAY.year - 5, TrainingStage.SSM)
        self.add(CoachProfile(user_id=self.athlete_coach.id, organization_id=self.orgs[0].id))

        self.athletes: list[User] = [self.athlete, self.athlete_coach]
        disc_list = list(self.disc.values())
        for i in range(70):
            gender = Gender.MALE if rnd.random() < 0.7 else Gender.FEMALE
            last = rnd.choice(LAST)
            if gender == Gender.MALE:
                first, middle = rnd.choice(MALE), rnd.choice(PATRONYMIC_M)
            else:
                first, middle, last = rnd.choice(FEMALE), rnd.choice(PATRONYMIC_F), female_last(last)
            birth = date(rnd.randint(TODAY.year - 24, TODAY.year - 11), rnd.randint(1, 12), rnd.randint(1, 28))
            org = rnd.choice(self.orgs + [None])
            mun = self.db.get(Municipality, org.municipality_id) if org else rnd.choice(self.mun)
            u = self.user(f"athlete{i + 1:02d}@fsp56.demo", last, first, middle, birth, gender, [Role.ATHLETE], mun)
            main = rnd.choices(disc_list, weights=[40, 20, 10, 12, 12, 6])[0]
            extra = [rnd.choice(disc_list)] if rnd.random() < 0.25 else []
            stage = rnd.choice([TrainingStage.NP, TrainingStage.UTE, TrainingStage.SSM, None])
            start = TODAY.year - rnd.choice([4, 3, 2, 2, 1, 1, 0])
            self.athlete_profile(u, org, list({main, *extra}), start, stage)
            if start < TODAY.year - 1 and rnd.random() < 0.1:
                u.athlete.left_year = TODAY.year - 1
            self.athletes.append(u)
            if main in (algo, robotics) and rnd.random() < 0.4:
                self.link(self.coach, u, main)
            elif main in (algo, product) and rnd.random() < 0.2:
                self.link(self.athlete_coach, u, main)
        self.link(self.coach, self.athletes[5], self.athletes[5].athlete.disciplines[0], LinkStatus.PENDING)
        self.db.flush()


    def qualifications(self):
        def judge_q(user, cat, assigned):
            v = self.jcat[cat].validity_years
            self.add(
                JudgeQualification(
                    judge_id=user.id, category_id=self.jcat[cat].id, assigned_at=assigned,
                    order_number=f"СК-{assigned.year}/{rnd.randint(10, 99)}",
                    valid_until=add_years(assigned, v) if v else None,
                )
            )

        judge_q(self.judge, "c1", add_years(TODAY, -2) - timedelta(days=30))
        judge_q(self.secretary, "c3", add_years(TODAY, -2) + timedelta(days=25))
        judge_q(self.coach, "c2", TODAY - timedelta(days=200))
        self.add(JudgeCategoryRequest(judge_id=self.secretary.id, category_id=self.jcat["c2"].id, kind=RequestKind.ASSIGN,
                                      justification="Судейство 3 региональных соревнований за 2 года"))

    def grant_rank(self, athlete: User, disc: Discipline, code: str, assigned: date, result: Result | None = None):
        r = self.rank[code]
        self.add(
            AthleteRank(
                athlete_id=athlete.id, discipline_id=disc.id, rank_id=r.id, assigned_at=assigned,
                order_number=f"Пр-{assigned.year}/{rnd.randint(100, 999)}",
                valid_until=add_years(assigned, r.validity_years) if r.validity_years else None,
                basis_result_id=result.id if result else None,
            )
        )


    def competition(self, title, disc, ctype, level, age, start, days=1, status=CompetitionStatus.COMPLETED,
                    fmt=CompetitionFormat.OFFLINE, details=None, plan=CalendarPlan.REGIONAL, plan_no=None, deadline=None):
        ct = self.ctype[ctype]
        c = self.add(
            Competition(
                title=title, discipline_id=disc.id, type_id=ct.id, level=level, rating_level=infer_rating_level(level, ct),
                age_group_id=self.age[age].id, format=fmt, format_details=details,
                venue="г. Оренбург, ОГУ, корпус 2" if fmt != CompetitionFormat.ONLINE else "Онлайн",
                start_date=start, end_date=start + timedelta(days=days - 1),
                registration_deadline=deadline or start - timedelta(days=7), status=status,
                calendar_plan=plan, calendar_plan_number=plan_no or (f"{start.year}-{rnd.randint(100, 999)}" if plan != CalendarPlan.NONE else None),
                created_by_id=self.admin.id,
            )
        )
        self.db.flush()
        self.add(JudgeAssignment(competition_id=c.id, judge_id=self.judge.id, position_id=self.jpos["Главный судья"].id))
        self.add(JudgeAssignment(competition_id=c.id, judge_id=self.secretary.id, position_id=self.jpos["Главный секретарь"].id))
        return c

    def eligible(self, comp: Competition, disc: Discipline, n: int) -> list[User]:
        age_group = comp.age_group
        pool = [
            a for a in self.athletes
            if disc in a.athlete.disciplines and age_group.accepts(comp.start_date.year - a.birth_date.year)
        ]
        rnd.shuffle(pool)
        return pool[:n]

    def apply(self, comp: Competition, athletes: list[User], status=ApplicationStatus.APPROVED):
        for a in athletes:
            self.add(Application(competition_id=comp.id, athlete_id=a.id, submitted_by_id=a.id, submitted_as=Role.ATHLETE,
                                 status=status, decided_by_id=self.admin.id if status != ApplicationStatus.SUBMITTED else None))

    def finish(self, comp: Competition, athletes: list[User]):
        self.apply(comp, athletes)
        results = [self.add(Result(competition_id=comp.id, athlete_id=a.id, score=round(rnd.uniform(120, 600) / 10) * 10)) for a in athletes]
        if results:
            results[-1].score = None
            results[-1].note = "Не явился"
        assign_places(results)
        self.add(Protocol(competition_id=comp.id, number=f"{comp.start_date.year}-{comp.id:04d}", published_by_id=self.admin.id))
        self.db.flush()
        return results

    def competitions(self):
        algo, product, ai, robotics, infosec, uas = (self.disc[c] for c in ("algo", "product", "ai", "robotics", "infosec", "uas"))
        y = TODAY.year
        L = CompetitionLevel
        past = [
            ("Первенство Оренбургской области по программированию алгоритмическому", algo, "Первенство", L.REGIONAL, "youth", date(y - 1, 3, 15)),
            ("Чемпионат Оренбургской области по программированию алгоритмическому", algo, "Чемпионат", L.REGIONAL, "adults", date(y - 1, 4, 20)),
            ("Межрегиональные соревнования ПФО по программированию продуктовому", product, "Турнир", L.INTERREGIONAL, "adults", date(y - 1, 10, 10)),
            ("Первенство Оренбургской области по программированию робототехники", robotics, "Первенство", L.REGIONAL, "kids", date(y - 1, 11, 22)),
            ("Кубок Оренбургской области по программированию систем ИИ", ai, "Кубок", L.REGIONAL, "juniors", date(y, 2, 8)),
            ("Первенство Оренбургской области по программированию алгоритмическому", algo, "Первенство", L.REGIONAL, "youth", date(y, 3, 14)),
            ("Межрегиональные соревнования «Кибероборона Урала»", infosec, "Турнир", L.INTERREGIONAL, "juniors", date(y, 5, 17)),
        ]
        for title, disc, ctype, level, age, start in past:
            plan = CalendarPlan.EKP if level != L.REGIONAL else CalendarPlan.REGIONAL
            comp = self.competition(f"{title} {start.year}", disc, ctype, level, age, start, plan=plan)
            participants = self.eligible(comp, disc, rnd.randint(8, 14))
            if disc == algo and age == "youth" and self.athlete not in participants and self.athlete in self.eligible(comp, disc, 100):
                participants.append(self.athlete)
            results = self.finish(comp, participants)
            winner = next((r for r in results if r.place == 1), None)
            if winner:
                self.grant_rank(self.db.get(User, winner.athlete_id), disc, "s2" if level == L.REGIONAL else "s1", start + timedelta(days=30), winner)

        self.grant_rank(self.athlete, ai, "y1", add_years(TODAY, -2) + timedelta(days=40))
        last_algo = self.db.query(Result).join(Competition).filter(Competition.discipline_id == algo.id).first()
        self.add(RankRequest(athlete_id=last_algo.athlete_id, submitted_by_id=self.coach.id, discipline_id=algo.id,
                             rank_id=self.rank["s3"].id, kind=RequestKind.ASSIGN, result_id=last_algo.id))

        open_comp = self.competition(
            f"Первенство Оренбургской области по программированию алгоритмическому (осень) {y}", algo, "Первенство",
            L.REGIONAL, "youth", TODAY + timedelta(days=21), days=2, status=CompetitionStatus.REGISTRATION_OPEN,
            fmt=CompetitionFormat.MIXED, details="Отборочный тур - онлайн, финал - очно в ОГУ", deadline=TODAY + timedelta(days=10),
        )
        others = [a for a in self.eligible(open_comp, algo, 9) if a is not self.athlete]
        self.apply(open_comp, others[:5], ApplicationStatus.APPROVED)
        self.apply(open_comp, others[5:8], ApplicationStatus.SUBMITTED)

        self.competition(
            f"Чемпионат Оренбургской области по программированию продуктовому {y}", product, "Чемпионат", L.REGIONAL, "adults",
            TODAY + timedelta(days=45), days=3, status=CompetitionStatus.REGISTRATION_OPEN, fmt=CompetitionFormat.MIXED,
            details="Разработка - онлайн, защита проектов - очно", deadline=TODAY + timedelta(days=30),
        )
        self.competition(
            f"Кубок Оренбургской области по программированию БАС {y}", uas, "Кубок", L.REGIONAL, "juniors",
            TODAY + timedelta(days=70), status=CompetitionStatus.DRAFT, plan=CalendarPlan.NONE,
        )
        self.competition(
            f"Всероссийские соревнования по программированию систем ИИ {y + 1}", ai, "Турнир", L.ALL_RUSSIAN, "adults",
            date(y + 1, 2, 20), days=2, status=CompetitionStatus.DRAFT, fmt=CompetitionFormat.ONLINE, plan=CalendarPlan.EKP,
        )


    def extras(self):
        db = self.db
        algo, robotics = self.disc["algo"], self.disc["robotics"]
        school = self.orgs[2]
        pupils = [l.athlete for l in db.scalars(select(CoachAthleteLink).where(
            CoachAthleteLink.coach_id == self.coach.id, CoachAthleteLink.status == LinkStatus.ACTIVE))]
        g_ute = self.add(TrainingGroup(organization_id=school.id, discipline_id=algo.id, stage=TrainingStage.UTE,
                                       coach_id=self.coach.id, name="УТЭ-2 «Алгоритмы»", year=TODAY.year))
        g_np = self.add(TrainingGroup(organization_id=school.id, discipline_id=robotics.id, stage=TrainingStage.NP,
                                      coach_id=self.coach.id, name="НП-1 «Робототехника»", year=TODAY.year))
        self.add(TrainingGroup(organization_id=school.id, discipline_id=algo.id, stage=TrainingStage.SSM,
                               coach_id=self.coach.id, name="ССМ-1 «Алгоритмы»", year=TODAY.year))
        db.flush()
        algo_pupils = [a for a in pupils if algo in a.athlete.disciplines]
        robo_pupils = [a for a in pupils if robotics in a.athlete.disciplines and a not in algo_pupils]
        for a in algo_pupils:
            g_ute.members.append(GroupMember(athlete_id=a.id, enrolled_at=date(TODAY.year - 1, 9, 1), reason="Зачисление"))
            a.athlete.training_stage = TrainingStage.UTE
        for a in robo_pupils:
            g_np.members.append(GroupMember(athlete_id=a.id, enrolled_at=date(TODAY.year, 9, 1), reason="Зачисление"))
            a.athlete.training_stage = TrainingStage.NP
        db.flush()
        topics = ["Динамическое программирование", "Графы: кратчайшие пути", "Разбор отборочного тура", "Строковые алгоритмы",
                  "Структуры данных: дерево отрезков", "Контест-тренировка"]
        for i, topic in enumerate(topics):
            fmt = CompetitionFormat.ONLINE if i % 3 == 2 else CompetitionFormat.OFFLINE
            s = self.add(TrainingSession(
                group_id=g_ute.id, held_on=TODAY - timedelta(days=7 * (len(topics) - i)), format=fmt, topic=topic, hours=2,
                created_by_id=self.coach.id,
                confirmation_url=f"https://contest.fsp56.demo/logs/session-{i + 1}" if fmt != CompetitionFormat.OFFLINE else None))
            s.attendees = [a for a in algo_pupils if rnd.random() < 0.85]
        good = {"Бег 60 м": 9.8, "Сгибание-разгибание рук в упоре лёжа": 26, "Скорость печати на клавиатуре": 185}
        for n in [n for n in self.norms if n.stage == TrainingStage.UTE and n.gender in (None, Gender.MALE)]:
            db.add(NormResult(athlete_id=self.athlete.id, standard_id=n.id, value=good[n.name], passed=n.is_passed(good[n.name]),
                              taken_on=TODAY - timedelta(days=20), recorded_by_id=self.coach.id))
        for a in [a for a in algo_pupils if a is not self.athlete][:3]:
            for n in [n for n in self.norms if n.stage == TrainingStage.UTE and n.gender in (None, a.gender)]:
                k = rnd.uniform(0.75, 1.1) if n.direction == NormDirection.HIGHER_BETTER else rnd.uniform(0.95, 1.15)
                v = round(good[n.name] * k, 1)
                db.add(NormResult(athlete_id=a.id, standard_id=n.id, value=v, passed=n.is_passed(v),
                                  taken_on=TODAY - timedelta(days=20), recorded_by_id=self.coach.id))
        db.add(Attestation(athlete_id=self.athlete.id, from_stage=TrainingStage.NP, to_stage=TrainingStage.UTE,
                           decided_on=date(TODAY.year - 1, 8, 30), decided_by_id=self.coach.id, comment="Нормативы НП выполнены"))

        db.add(Disqualification(athlete_id=self.athletes[10].id, date_from=TODAY - timedelta(days=60),
                                date_to=TODAY + timedelta(days=120), reason="Использование посторонней помощи на соревновании (демо)"))

        res = db.scalar(select(Result).join(Competition).where(Result.athlete_id == self.athlete.id)
                        .order_by(Competition.start_date.desc()))
        if res:
            ap = self.add(Appeal(
                competition_id=res.competition_id, athlete_id=self.athlete.id, submitted_by_id=self.athlete.id,
                text="Задача E засчитана как неверная, хотя решение проходит все тесты из разбора. Прошу перепроверить посылку.",
                status=AppealStatus.UNDER_REVIEW))
            db.flush()
            db.add(CaseEvent(subject="appeal", subject_id=ap.id, status="submitted", by_user_id=self.athlete.id, comment="Апелляция подана"))
            db.add(CaseEvent(subject="appeal", subject_id=ap.id, status="under_review", by_user_id=self.admin.id, comment="Принята к рассмотрению"))
            other = next(r for r in res.competition.results if r.athlete_id != self.athlete.id)
            v = self.add(Violation(competition_id=res.competition_id, athlete_id=other.athlete_id, reported_by_id=self.judge.id,
                                   report="Совпадение кода решений двух участников на 92% по задачам B и D (лог антиплагиата)."))
            db.flush()
            db.add(CaseEvent(subject="violation", subject_id=v.id, status="reported", by_user_id=self.judge.id, comment="Рапорт зарегистрирован"))
            c = self.add(ParticipationCertificate(number="", verify_code=f"demo{res.id:04d}", athlete_id=self.athlete.id,
                                                  result_id=res.id, purpose="портфолио"))
            db.flush()
            c.number = f"СП-{TODAY.year}-{c.id:06d}"

        from .services import rating as rating_svc

        db.flush()
        rows, _ = rating_svc.compute(db, algo.id, TODAY.year)
        team = self.add(NationalTeam(discipline_id=algo.id, season=TODAY.year,
                                     title=f"Сборная Оренбургской области по программированию алгоритмическому, сезон {TODAY.year}"))
        db.flush()
        for i, r in enumerate(rows[:6]):
            team.members.append(TeamMember(athlete_id=r.athlete_id, role=TeamMemberRole.MAIN if i < 4 else TeamMemberRole.RESERVE,
                                           position=i, rating_points=r.total))

        db.add(OAuthClient(client_id="demo-client", name="Портал «Олимпиады Оренбуржья» (тестовый клиент)",
                           redirect_uris=[f"{settings.issuer}/demo-client/"]))

    def run(self):
        self.dictionaries()
        self.people()
        self.qualifications()
        self.competitions()
        self.extras()
        self.db.commit()


def main():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        Seeder(db).run()
        print(f"Готово: {db.query(User).count()} пользователей, {db.query(Competition).count()} соревнований.")
        print(f"Демо-аккаунты (пароль {PASSWORD}): admin@, ministry@, coach@ (тренер+судья), judge@, "
              "athlete@, student@ (спортсмен+тренер) - домен fsp56.demo")


if __name__ == "__main__":
    main()
