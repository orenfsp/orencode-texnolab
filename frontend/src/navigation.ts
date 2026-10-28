import type { Role } from "./api";

export type Tab = { to: string; label: string };
export type NavItem = { label: string; to: string; tabs?: Tab[]; match?: string[] };

const REPORTS: Tab[] = [
  { to: "/admin/reports", label: "Численность" },
  { to: "/admin/rating", label: "Рейтинг" },
  { to: "/admin/teams", label: "Сборная" },
  { to: "/admin/indicators", label: "Развитие вида спорта" },
];
const PEOPLE: Tab[] = [
  { to: "/admin/registry", label: "Реестр" },
  { to: "/admin/groups", label: "Группы подготовки" },
];

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { label: "Сводка", to: "/admin" },
    { label: "Соревнования", to: "/admin/competitions" },
    { label: "Апелляции", to: "/admin/appeals" },
    { label: "Разряды и судьи", to: "/admin/ranks", tabs: [{ to: "/admin/ranks", label: "Разряды" }, { to: "/admin/judges", label: "Судьи и категории" }] },
    { label: "Люди и организации", to: "/admin/registry", tabs: PEOPLE, match: ["/admin/organizations"] },
    { label: "Отчёты", to: "/admin/reports", tabs: [...REPORTS, { to: "/admin/prizes", label: "Премии Губернатора" }] },
    { label: "Настройки", to: "/admin/norms", tabs: [
      { to: "/admin/norms", label: "Нормативы ФССП" },
      { to: "/admin/integrations", label: "Интеграции и ФСП ID" },
      { to: "/admin/audit", label: "Журнал действий" },
    ] },
  ],
  ministry: [
    { label: "Сводка", to: "/admin" },
    { label: "Соревнования", to: "/admin/competitions" },
    { label: "Люди и организации", to: "/admin/registry", tabs: PEOPLE, match: ["/admin/organizations"] },
    { label: "Отчёты", to: "/admin/reports", tabs: REPORTS },
  ],
  athlete: [
    { label: "Календарь", to: "/calendar" },
    { label: "Мои заявки", to: "/athlete/applications" },
    { label: "Результаты", to: "/athlete/results", tabs: [{ to: "/athlete/results", label: "Разряд и выступления" }, { to: "/appeals", label: "Апелляции" }] },
    { label: "Мой путь", to: "/athlete/path" },
    { label: "Профиль", to: "/profile" },
  ],
  coach: [
    { label: "Мои спортсмены", to: "/coach/athletes" },
    { label: "Календарь и заявки", to: "/calendar", tabs: [{ to: "/calendar", label: "Календарь" }, { to: "/coach/applications", label: "Поданные заявки" }] },
    { label: "Разряды подопечных", to: "/coach/ranks" },
    { label: "Группы и журнал", to: "/coach/groups" },
    { label: "Апелляции", to: "/appeals" },
    { label: "Профиль", to: "/profile" },
  ],
  judge: [
    { label: "Судейство", to: "/judge" },
    { label: "Профиль", to: "/profile" },
  ],
};

const under = (path: string, to: string) => path === to || path.startsWith(to + "/");

export function sectionFor(role: Role, path: string): NavItem | undefined {
  const items = NAV[role];
  return (
    items.find((i) => i.tabs?.some((t) => under(path, t.to)) || i.match?.some((m) => under(path, m))) ??
    [...items].sort((a, b) => b.to.length - a.to.length).find((i) => under(path, i.to))
  );
}
