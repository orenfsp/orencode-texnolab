import { Fragment, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Dialog, Empty, Field, Loading, PageHeader, Place, Section, Select, Table, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { fmtDate, RATING_LEVEL } from "../../labels";

export interface RatingRow {
  position: number; athlete_id: number; full_name: string; birth_year: number | null; organization: string | null; rank: string | null;
  entries: { competition_id: number; title: string; date: string; level: string; place: number | null; points: number }[];
  base: number; podiums: number; coefficient: number; total: number; excluded_reason: string | null;
}
export interface RatingData { discipline: string; season: number; rules: string; rows: RatingRow[]; excluded: RatingRow[] }

interface Settings { rules: { rating_level: string; place: number; points: number }[]; stability_coefficient: number; stability_min_podiums: number }

export function useRating(discipline: string, season: string, ageGroup = "", minRank = "") {
  const q = new URLSearchParams(Object.entries({ discipline_id: discipline, season, age_group_id: ageGroup, min_rank_id: minRank }).filter(([, v]) => v));
  return useApi<RatingData>(discipline ? `/api/rating?${q}` : null);
}

export function RatingTable({ rows, selectable, selected, onToggle }: {
  rows: RatingRow[]; selectable?: boolean; selected?: Set<number>; onToggle?: (id: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Table head={<>{selectable && <th className="w-10"><span className="sr-only">В сборную</span></th>}<th>Место</th><th>Спортсмен</th><th className="text-right">Баллы</th><th className="text-right">Коэфф.</th><th className="text-right">Итого</th><th /></>}>
      {rows.map((r) => (
        <Fragment key={r.athlete_id}>
          <tr>
            {selectable && <td><input type="checkbox" aria-label={`Включить ${r.full_name}`} checked={selected?.has(r.athlete_id)} onChange={() => onToggle?.(r.athlete_id)} /></td>}
            <td><Place place={r.position} /></td>
            <td className="font-medium">{r.full_name}<div className="text-xs font-normal text-ink-muted">{r.birth_year} г. р., {r.organization ?? "без организации"}; {r.rank ?? "б/р"}</div></td>
            <td className="num text-right">{r.base}</td>
            <td className="num text-right">{r.coefficient > 1 ? <span title={`${r.podiums} призовых места за сезон`}>×{r.coefficient}</span> : "-"}</td>
            <td className="num text-right font-bold">{r.total}</td>
            <td className="text-right"><button className="btn-quiet btn-sm" aria-expanded={open === r.athlete_id} onClick={() => setOpen(open === r.athlete_id ? null : r.athlete_id)}>{open === r.athlete_id ? "Скрыть" : "Расчёт"}</button></td>
          </tr>
          {open === r.athlete_id && (
            <tr>
              <td colSpan={selectable ? 7 : 6} className="bg-white">
                <ul className="space-y-1 text-sm">
                  {r.entries.map((e) => (
                    <li key={e.competition_id} className="flex flex-wrap items-center gap-2">
                      <Place place={e.place} size="sm" />
                      <span className="flex-1">{e.title} <span className="text-ink-muted">({fmtDate(e.date)}, {e.level.toLowerCase()})</span></span>
                      <span className="num">{e.points} б.</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-ink-soft">
                  Сумма {r.base}{r.coefficient > 1 ? ` × ${r.coefficient} (призовые места: ${r.podiums})` : ` (призовых мест: ${r.podiums}, коэффициент не применяется)`} = {r.total}
                </p>
              </td>
            </tr>
          )}
        </Fragment>
      ))}
    </Table>
  );
}

export default function Rating() {
  const { me } = useAuth();
  const dicts = useDictionaries();
  const y = new Date().getFullYear();
  const [f, setF] = useState({ discipline: "", season: String(y), age: "", rank: "" });
  useEffect(() => { if (dicts && !f.discipline) setF((s) => ({ ...s, discipline: String(dicts.disciplines[0].id) })); }, [dicts, f.discipline]);
  const rating = useRating(f.discipline, f.season, f.age, f.rank);
  const [settings, setSettings] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const opt = (items?: { id: number; name: string }[]) => items?.map((d) => [d.id, d.name] as [number, string]) ?? [];

  return (
    <>
      <PageHeader title="Рейтинг спортсменов" lead={rating.data?.rules}
                  actions={me?.active_role === "admin" && <button className="btn-secondary" onClick={() => setSettings(true)}>Настройки баллов</button>} />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Дисциплина" value={f.discipline} onChange={set("discipline")} options={opt(dicts?.disciplines)} />
        <Select label="Сезон" value={f.season} onChange={set("season")} options={[y, y - 1, y - 2].map((v) => [v, String(v)])} />
        <Select label="Возрастная группа" value={f.age} onChange={set("age")} required={false} placeholder="Все" options={opt(dicts?.age_groups)} />
        <Select label="Разряд не ниже" value={f.rank} onChange={set("rank")} required={false} placeholder="Любой" options={opt(dicts?.sport_ranks)} />
      </div>
      {!rating.data ? <Loading /> : rating.data.rows.length === 0 ? <Empty>За сезон нет результатов по этой дисциплине.</Empty> : <RatingTable rows={rating.data.rows} />}
      {rating.data && rating.data.excluded.length > 0 && (
        <Section title="Не включены в рейтинг" className="mt-10">
          <ul className="space-y-1 text-sm">
            {rating.data.excluded.map((r) => <li key={r.athlete_id}><Badge tone="rose">Исключён</Badge> {r.full_name}: {r.excluded_reason}</li>)}
          </ul>
        </Section>
      )}
      <Dialog open={settings} onClose={() => setSettings(false)} title="Баллы рейтинга"><SettingsForm onSaved={() => { setSettings(false); rating.reload(); }} /></Dialog>
    </>
  );
}

function SettingsForm({ onSaved }: { onSaved: () => void }) {
  const { data } = useApi<Settings>("/api/admin/settings/rating");
  const [s, setS] = useState<Settings | null>(null);
  const { busy, run, feedback } = useAction();
  useEffect(() => { if (data) setS(data); }, [data]);
  if (!s) return <Loading />;
  const levels = [...new Set(s.rules.map((r) => r.rating_level))];
  const point = (level: string, place: number) => s.rules.find((r) => r.rating_level === level && r.place === place)?.points ?? 0;
  const setPoint = (level: string, place: number, v: number) => {
    const others = s.rules.filter((r) => !(r.rating_level === level && r.place === place));
    setS({ ...s, rules: [...others, { rating_level: level, place, points: v }] });
  };
  return (
    <div className="grid gap-4">
      {feedback}
      <Table head={<><th>Уровень</th>{[1, 2, 3].map((p) => <th key={p}>{p} место</th>)}</>}>
        {levels.map((l) => (
          <tr key={l}>
            <td className="text-sm">{RATING_LEVEL[l]}</td>
            {[1, 2, 3].map((p) => <td key={p}><input aria-label={`${RATING_LEVEL[l]}, ${p} место`} type="number" className="input w-20" value={point(l, p)} onChange={(e) => setPoint(l, p, Number(e.target.value))} /></td>)}
          </tr>
        ))}
      </Table>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Коэффициент стабильности">{(id) => <input id={id} type="number" step="0.05" className="input" value={s.stability_coefficient} onChange={(e) => setS({ ...s, stability_coefficient: Number(e.target.value) })} />}</Field>
        <Field label="Призовых мест для коэффициента">{(id) => <input id={id} type="number" className="input" value={s.stability_min_podiums} onChange={(e) => setS({ ...s, stability_min_podiums: Number(e.target.value) })} />}</Field>
      </div>
      <button className="btn-primary justify-self-start" disabled={busy} onClick={() => run(() => api("/api/admin/settings/rating", { method: "PUT", json: s }).then(onSaved))}>Сохранить настройки</button>
    </div>
  );
}
