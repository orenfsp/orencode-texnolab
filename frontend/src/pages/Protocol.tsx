import { useParams } from "react-router-dom";
import { dl, type Protocol } from "../api";
import { useAuth } from "../auth";
import { DownloadButtons, ErrorBox, Loading, Place } from "../components/ui";
import { useApi } from "../hooks";
import { fmtDate, fmtRange, FORMAT, LEVEL, PLAN } from "../labels";

export default function ProtocolPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const { data, error } = useApi<Protocol>(`/api/competitions/${id}/protocol`);
  if (error) return <ErrorBox message="Протокол ещё не опубликован или не найден." />;
  if (!data) return <Loading />;
  const c = data.competition;
  const podium = data.rows.filter((r) => r.place && r.place <= 3);
  return (
    <article className="max-w-5xl">
      <header className="border-b-2 border-ink pb-6">
        <p className="text-sm text-ink-soft">Региональное отделение Федерации спортивного программирования Оренбургской области</p>
        <h1 className="mt-3 hyphens-auto text-xl font-bold [overflow-wrap:anywhere] sm:text-3xl">Протокол № {data.number}</h1>
        <p className="mt-2 text-lg">{c.title}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm text-ink-soft sm:grid-cols-2">
          <div>Дисциплина: {c.discipline.name}</div>
          <div>Сроки: {fmtRange(c.start_date, c.end_date)}</div>
          <div>{LEVEL[c.level]} {c.type.name.toLowerCase()}, {c.age_group.name.toLowerCase()}</div>
          <div>Формат: {FORMAT[c.format].toLowerCase()}{c.venue ? `, ${c.venue}` : ""}</div>
          {c.calendar_plan_number && <div className="sm:col-span-2">{PLAN[c.calendar_plan]}, № {c.calendar_plan_number}</div>}
          <div className="sm:col-span-2">Опубликован {fmtDate(data.published_at)}</div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <DownloadButtons items={[
            { label: "Скачать .xlsx", onClick: dl(`/api/competitions/${c.id}/protocol.xlsx`, `протокол_${c.id}.xlsx`) },
            { label: "Скачать .docx", onClick: dl(`/api/competitions/${c.id}/protocol.docx`, `протокол_${c.id}.docx`) },
          ]} />
        </div>
      </header>

      {podium.length > 0 && (
        <ol className="my-8 grid gap-6 sm:grid-cols-3">
          {podium.map((r) => (
            <li key={r.athlete_id} className="flex items-center gap-4">
              <Place place={r.place} size="lg" />
              <div><div className="font-semibold">{r.full_name}</div><div className="text-sm text-ink-soft">{r.organization}, {r.score} баллов</div></div>
            </li>
          ))}
        </ol>
      )}

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="proto">
          <thead><tr><th>Место</th><th>Участник</th><th>Г. р.</th><th>Организация</th><th>Разряд</th><th className="text-right">Баллы</th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.athlete_id} className={me?.id === r.athlete_id ? "bg-fed-tint" : ""}>
                <td><Place place={r.place} size="sm" /></td>
                <td className="font-medium">{r.full_name}{me?.id === r.athlete_id && <span className="ml-2 text-xs font-normal text-fed-dark">это вы</span>}{r.note && <div className="text-xs font-normal text-ink-muted">{r.note}</div>}</td>
                <td className="tabular-nums">{r.birth_year}</td>
                <td className="text-sm">{r.organization}<div className="text-xs text-ink-muted">{r.municipality}</div></td>
                <td className="text-sm">{r.rank ?? "б/р"}</td>
                <td className="num text-right">{r.score ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.judges.length > 0 && (
        <footer className="mt-8 border-t border-line pt-4 text-sm">
          <div className="mb-2 font-semibold">Судейская коллегия</div>
          <ul className="space-y-1">{data.judges.map((j, i) => <li key={i}>{j.position}: {j.full_name}{j.category ? `, ${j.category.toLowerCase()}` : ""}</li>)}</ul>
        </footer>
      )}
    </article>
  );
}
