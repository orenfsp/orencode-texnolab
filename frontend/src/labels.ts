import type { ApplicationStatus, Competition, CompetitionStatus, Role } from "./api";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Федерация",
  athlete: "Спортсмен",
  coach: "Тренер",
  judge: "Судья",
  ministry: "Минспорт",
};

export const COMPETITION_STATUS: Record<CompetitionStatus, { label: string; tone: Tone }> = {
  draft: { label: "Черновик", tone: "slate" },
  registration_open: { label: "Приём заявок", tone: "green" },
  registration_closed: { label: "Приём закрыт", tone: "amber" },
  completed: { label: "Протокол опубликован", tone: "blue" },
  cancelled: { label: "Отменено", tone: "rose" },
};

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  submitted: { label: "На модерации", tone: "amber" },
  approved: { label: "Одобрена", tone: "green" },
  rejected: { label: "Отклонена", tone: "rose" },
  withdrawn: { label: "Отозвана", tone: "slate" },
};

export const LEVEL: Record<Competition["level"], string> = {
  regional: "Региональное",
  interregional: "Межрегиональное",
  all_russian: "Всероссийское",
};

export const FORMAT: Record<Competition["format"], string> = {
  offline: "Очно",
  online: "Онлайн",
  mixed: "Смешанный",
};

export const PLAN: Record<Competition["calendar_plan"], string> = {
  none: "Не включено",
  ekp: "ЕКП Минспорта России",
  regional: "Календарный план Оренбургской области",
};

export type Tone = "slate" | "green" | "amber" | "blue" | "rose";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("ru-RU") : "-";

export const fmtRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);

export const STAGE: Record<string, string> = {
  np: "Начальная подготовка",
  ute: "Учебно-тренировочный этап",
  ssm: "Совершенствование спортивного мастерства",
  vsm: "Высшее спортивное мастерство",
};
export const STAGE_SHORT: Record<string, string> = { np: "НП", ute: "УТЭ", ssm: "ССМ", vsm: "ВСМ" };

export const RATING_LEVEL: Record<string, string> = {
  rus_championship: "Чемпионат России",
  rus_youth: "Первенство России",
  interregional: "Межрегиональные",
  regional: "Региональные",
  none: "Не учитывается",
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: "На рассмотрении", tone: "amber" },
  approved: { label: "Одобрена", tone: "green" },
  rejected: { label: "Отклонена", tone: "rose" },
};

export const LINK_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Ждёт подтверждения", tone: "amber" },
  active: { label: "Активна", tone: "green" },
  suspended: { label: "Приостановлена", tone: "slate" },
  ended: { label: "Завершена", tone: "slate" },
  declined: { label: "Отклонена", tone: "rose" },
};

export const APPEAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: "Подана", tone: "amber" },
  under_review: { label: "На рассмотрении", tone: "blue" },
  accepted: { label: "Удовлетворена", tone: "green" },
  rejected: { label: "Отклонена", tone: "rose" },
};

export const VIOLATION_DECISION: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Ожидает решения", tone: "amber" },
  reported: { label: "Рапорт зарегистрирован", tone: "amber" },
  no_violation: { label: "Нарушение не подтверждено", tone: "slate" },
  warning: { label: "Предупреждение", tone: "amber" },
  technical_defeat: { label: "Техническое поражение", tone: "rose" },
  disqualification: { label: "Дисквалификация", tone: "rose" },
};

export const ORG_TYPE: Record<string, string> = {
  school: "Школа", college: "Колледж", university: "Вуз", sport_school: "Спортивная школа", club: "Клуб", other: "Другое",
};

export const daysWord = (n: number) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? "дней" : b === 1 ? "день" : b >= 2 && b <= 4 ? "дня" : "дней";
};
export const inDays = (n: number) => (n === 0 ? "сегодня" : n < 0 ? "срок прошёл" : `через ${n} ${daysWord(n)}`);
export const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
