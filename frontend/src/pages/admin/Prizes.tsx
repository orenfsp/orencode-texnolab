import { Fragment, useEffect, useState } from "react";
import { api, dl } from "../../api";
import { Badge, Dialog, Empty, Loading, PageHeader, Section, Table, useAction } from "../../components/ui";
import { useApi } from "../../hooks";
import { daysWord, fmtDate, RATING_LEVEL, rub } from "../../labels";

interface Item { athlete_id: number; full_name: string; birth_date: string | null; passport: string; inn: string; snils: string; amount: number; results: { competition: string; date: string; level: string; place: number; amount: number }[] }
interface Candidates { year: number; deadline: string; items: Item[]; total: number }
interface Petition { id: number; year: number; status: "prepared" | "sent" | "awarded"; total_amount: number; items: Item[]; created_at: string; sent_at: string | null; awarded_at: string | null }
interface Rule { rating_level: string; place: number; amount: number }

const PETITION: Record<Petition["status"], { label: string; tone: "amber" | "blue" | "green"; next?: [Petition["status"], string] }> = {
  prepared: { label: "Подготовлено", tone: "amber", next: ["sent", "Отметить: направлено"] },
  sent: { label: "Направлено", tone: "blue", next: ["awarded", "Отметить: премия назначена"] },
  awarded: { label: "Премия назначена", tone: "green" },
};

export default function Prizes() {
  const lastYear = new Date().getMonth() < 2 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  const [year, setYear] = useState(lastYear);
  const cand = useApi<Candidates>(`/api/prizes/candidates?year=${year}`);
  const petitions = useApi<Petition[]>("/api/prizes/petitions");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [rules, setRules] = useState(false);
  const { busy, run, feedback } = useAction();
  const days = cand.data ? Math.ceil((new Date(cand.data.deadline).getTime() - Date.now()) / 864e5) : null;
  const chosen = cand.data?.items.filter((i) => !excluded.has(i.athlete_id)) ?? [];

  return (
    <>
      <PageHeader title="Премии Губернатора" lead="Платформа отбирает претендентов по протоколам года и считает суммы по справочнику размеров премий. Паспорт, ИНН и СНИЛС в демо замаскированы."
                  actions={<button className="btn-secondary" onClick={() => setRules(true)}>Размеры премий</button>} />
      {feedback}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <div className="flex gap-2">{[lastYear, lastYear - 1].map((y) => <button key={y} className={y === year ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => { setYear(y); setExcluded(new Set()); }}>{y} год</button>)}</div>
        {cand.data && days !== null && <span className={`text-sm ${days <= 30 ? "font-semibold text-signal" : "text-ink-soft"}`}>Ходатайства подаются до {fmtDate(cand.data.deadline)}{days >= 0 && `, осталось ${days} ${daysWord(days)}`}</span>}
      </div>
      <Section title="Претенденты" actions={cand.data && chosen.length > 0 && (
        <button className="btn-primary" disabled={busy}
                onClick={() => run(() => api("/api/prizes/petitions", { method: "POST", json: { year, athlete_ids: chosen.map((c) => c.athlete_id) } }).then(petitions.reload), "Ходатайство подготовлено")}>
          Подготовить ходатайство на {rub(chosen.reduce((s, i) => s + i.amount, 0))}
        </button>
      )}>
        {!cand.data ? <Loading /> : cand.data.items.length === 0 ? <Empty>За {year} год результатов, дающих право на премию, нет.</Empty> : (
          <Table head={<><th className="w-10"><span className="sr-only">Включить</span></th><th>Спортсмен</th><th>Результаты</th><th>Документы</th><th className="text-right">Сумма</th></>}>
            {cand.data.items.map((i) => (
              <tr key={i.athlete_id} className={excluded.has(i.athlete_id) ? "opacity-50" : ""}>
                <td><input type="checkbox" aria-label={`Включить ${i.full_name}`} checked={!excluded.has(i.athlete_id)}
                           onChange={() => { const n = new Set(excluded); if (n.has(i.athlete_id)) n.delete(i.athlete_id); else n.add(i.athlete_id); setExcluded(n); }} /></td>
                <td className="font-medium">{i.full_name}<div className="text-xs font-normal text-ink-muted">{fmtDate(i.birth_date)}</div></td>
                <td className="text-sm">{i.results.map((r, k) => <div key={k}>{r.place} место: {r.competition} <span className="text-ink-muted">({r.level.toLowerCase()}, {rub(r.amount)})</span></div>)}</td>
                <td className="num text-xs text-ink-muted">паспорт {i.passport}<br />ИНН {i.inn}<br />СНИЛС {i.snils}</td>
                <td className="num text-right font-bold">{rub(i.amount)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Section title="Ходатайства">
        {!petitions.data ? <Loading /> : petitions.data.length === 0 ? <Empty>Ходатайств ещё нет.</Empty> : (
          <Table head={<><th>Год</th><th>Претендентов</th><th className="text-right">Сумма</th><th>Статус</th><th /></>}>
            {petitions.data.map((p) => (
              <tr key={p.id}>
                <td className="num">{p.year}</td>
                <td className="num">{p.items.length}</td>
                <td className="num text-right">{rub(p.total_amount)}</td>
                <td><Badge tone={PETITION[p.status].tone}>{PETITION[p.status].label}</Badge><div className="mt-1 text-xs text-ink-muted">от {fmtDate(p.created_at)}</div></td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-quiet btn-sm" onClick={dl(`/api/prizes/petitions/${p.id}.docx`, `ходатайство_${p.year}_${p.id}.docx`)}>Пакет документов .docx</button>
                  {PETITION[p.status].next && (
                    <button className="btn-secondary btn-sm" disabled={busy}
                            onClick={() => run(() => api(`/api/prizes/petitions/${p.id}/status`, { method: "POST", json: { status: PETITION[p.status].next![0] } }).then(petitions.reload), "Статус ходатайства обновлён")}>
                      {PETITION[p.status].next![1]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Dialog open={rules} onClose={() => setRules(false)} title="Размеры премий"><RulesForm onSaved={() => { setRules(false); cand.reload(); }} /></Dialog>
    </>
  );
}

function RulesForm({ onSaved }: { onSaved: () => void }) {
  const { data } = useApi<Rule[]>("/api/admin/settings/prizes");
  const [rules, setRules] = useState<Rule[]>([]);
  const { busy, run, feedback } = useAction();
  useEffect(() => { if (data) setRules(data); }, [data]);
  if (!data) return <Loading />;
  const levels = [...new Set(rules.map((r) => r.rating_level))];
  const get = (l: string, p: number) => rules.find((r) => r.rating_level === l && r.place === p)?.amount ?? 0;
  const set = (l: string, p: number, v: number) => setRules([...rules.filter((r) => !(r.rating_level === l && r.place === p)), { rating_level: l, place: p, amount: v }]);
  return (
    <div className="grid gap-4">
      {feedback}
      <p className="text-sm text-ink-soft">Суммы в демо условные. Укажите размеры по действующей редакции Указа Губернатора № 93-ук.</p>
      <Table head={<><th>Уровень</th>{[1, 2, 3].map((p) => <th key={p}>{p} место, ₽</th>)}</>}>
        {levels.map((l) => (
          <Fragment key={l}>
            <tr>
              <td className="text-sm">{RATING_LEVEL[l]}</td>
              {[1, 2, 3].map((p) => <td key={p}><input aria-label={`${RATING_LEVEL[l]}, ${p} место`} type="number" step="1000" className="input w-28" value={get(l, p)} onChange={(e) => set(l, p, Number(e.target.value))} /></td>)}
            </tr>
          </Fragment>
        ))}
      </Table>
      <button className="btn-primary justify-self-start" disabled={busy} onClick={() => run(() => api("/api/admin/settings/prizes", { method: "PUT", json: rules }).then(onSaved))}>Сохранить</button>
    </div>
  );
}
