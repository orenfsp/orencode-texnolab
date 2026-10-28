import { Link } from "react-router-dom";
import type { CompetitionStatus } from "../../api";
import { useAuth } from "../../auth";
import Deadlines from "../../components/Deadlines";
import { Badge, ErrorBox, Loading, PageHeader, Section, Stat } from "../../components/ui";
import { useApi } from "../../hooks";
import { COMPETITION_STATUS, fmtDate } from "../../labels";

interface Dashboard {
  kpi: { athletes: number; competitions_this_year: number; participants_this_year: number; ranks_assigned_this_year: number };
  upcoming: { id: number; title: string; start_date: string; registration_deadline: string | null; status: CompetitionStatus }[];
  attention: { kind: string; title: string; detail: string; link: string; due: string | null }[];
}

export default function AdminDashboard() {
  const { me } = useAuth();
  const { data, error } = useApi<Dashboard>("/api/admin/dashboard");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const { kpi } = data;
  const actions = data.attention.filter((a) => !["rank_expiring", "judge_expiring", "registration_deadline", "report"].includes(a.kind));
  const year = new Date().getFullYear();
  return (
    <>
      <PageHeader title={me?.active_role === "ministry" ? "Спортивное программирование в области" : "Сводка федерации"} lead={`Данные на ${fmtDate(new Date().toISOString())}.`} />
      <div className="cut-br mb-12 grid grid-cols-2 gap-x-6 gap-y-8 bg-white px-6 py-6 lg:grid-cols-4 lg:divide-x lg:divide-line [&>*]:lg:pl-6 [&>*:first-child]:lg:pl-1">
        <Stat label="занимаются в реестре" value={kpi.athletes} />
        <Stat label={`соревнований в ${year} году`} value={kpi.competitions_this_year} />
        <Stat label="спортсменов выступили" value={kpi.participants_this_year} />
        <Stat label="разрядов присвоено" value={kpi.ranks_assigned_this_year} />
      </div>
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="min-w-0">
          {me?.active_role === "admin" && (
            <Section title="Ждёт решения">
              {actions.length === 0 ? <p className="text-sm text-ink-soft">Все заявки рассмотрены.</p> : (
                <ul className="cut-br divide-y divide-line bg-white px-4">
                  {actions.map((a, i) => (
                    <li key={i}>
                      <Link to={a.link} className="flex items-baseline justify-between gap-3 py-3 text-ink hover:text-fed">
                        <span className="shrink-0 font-medium">{a.title}</span>
                        <span className="min-w-0 truncate text-right text-sm text-ink-soft">{a.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
          <Section title="Ближайшие соревнования">
            <ul className="cut-br divide-y divide-line bg-white px-4">
              {data.upcoming.map((c) => (
                <li key={c.id}>
                  <Link to={`/admin/competitions/${c.id}`} className="flex gap-4 py-3 text-ink hover:text-fed">
                    <span className="num w-20 shrink-0 text-sm font-bold">{fmtDate(c.start_date).slice(0, 5)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{c.title}</span>
                      <span className="mt-1 inline-block"><Badge tone={COMPETITION_STATUS[c.status].tone}>{COMPETITION_STATUS[c.status].label}</Badge></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>
        <Section title="Сроки и напоминания"><Deadlines limit={12} /></Section>
      </div>
    </>
  );
}
