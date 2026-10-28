import { useState } from "react";
import { api, dl, type HistoryItem } from "../../api";
import { Badge, Dialog, Empty, Field, Loading, PageHeader, RowMenu, Select, Table, Tabs, usePager, useAction } from "../../components/ui";
import { useApi } from "../../hooks";
import { LINK_STATUS } from "../../labels";
import { HistoryTable } from "../athlete/Results";
import { NormsBlock, type Norms } from "../athlete/Path";

interface Pupil { link_id: number; athlete_id: number; full_name: string; birth_year: number | null; discipline_id: number; discipline: string; status: string }
interface Found { id: number; full_name: string; birth_year: number | null; organization: string | null; disciplines: { id: number; name: string }[] }

export default function CoachAthletes() {
  const { data, reload } = useApi<Pupil[]>("/api/me/athletes");
  const [open, setOpen] = useState<Pupil | null>(null);
  const { pageItems, pager } = usePager(data, 15);
  const [search, setSearch] = useState(false);
  const act = useAction();

  const setStatus = (linkId: number, status: string) =>
    act.run(() => api(`/api/links/${linkId}/status`, { method: "POST", json: { status } }).then(reload), "Статус связи изменён");

  return (
    <>
      <PageHeader title="Мои спортсмены" lead="Связь со спортсменом устанавливается по дисциплине: вы отправляете запрос, спортсмен подтверждает его в своём профиле."
                  actions={<button className="btn-primary" onClick={() => setSearch(true)}>Найти спортсмена в реестре</button>} />
      {act.feedback}
      {!data ? <Loading /> : data.length === 0 ? <Empty>Привязанных спортсменов нет. Найдите спортсмена в реестре и отправьте запрос.</Empty> : (
        <>
          <Table head={<><th>Спортсмен</th><th>Дисциплина</th><th>Связь</th><th /></>}>
            {pageItems.map((p) => (
              <tr key={p.link_id}>
                <td><button className="text-left font-medium text-ink hover:text-fed" onClick={() => setOpen(p)}>{p.full_name}</button><div className="text-sm text-ink-muted">{p.birth_year} г. р.</div></td>
                <td>{p.discipline}</td>
                <td><Badge tone={LINK_STATUS[p.status].tone}>{LINK_STATUS[p.status].label}</Badge></td>
                <td className="text-right">
                  <RowMenu items={[
                    { label: "Выступления и нормативы", onClick: () => setOpen(p) },
                    { label: "Приостановить работу", onClick: () => setStatus(p.link_id, "suspended"), hidden: p.status !== "active" },
                    { label: "Возобновить работу", onClick: () => setStatus(p.link_id, "active"), hidden: p.status !== "suspended" },
                    { label: "Завершить работу", danger: true, hidden: p.status === "pending",
                      onClick: () => window.confirm(`Завершить работу со спортсменом ${p.full_name}?`) && setStatus(p.link_id, "ended") },
                  ]} />
                </td>
              </tr>
            ))}
          </Table>
          {pager}
        </>
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.full_name ?? ""}>
        {open && <PupilCard id={open.athlete_id} />}
      </Dialog>
      <Dialog open={search} onClose={() => setSearch(false)} title="Запрос на привязку спортсмена">
        <LinkRequest onDone={() => { setSearch(false); reload(); }} />
      </Dialog>
    </>
  );
}

function PupilCard({ id }: { id: number }) {
  const [tab, setTab] = useState<"results" | "norms">("results");
  const results = useApi<HistoryItem[]>(`/api/me/athletes/${id}/results`);
  const norms = useApi<Norms>(tab === "norms" ? `/api/athletes/${id}/norms` : null);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs tabs={[["results", "Выступления"], ["norms", "Нормативы и этап"]]} value={tab} onChange={setTab} />
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={dl(`/api/athletes/${id}/participation.docx`, `выступления_${id}.docx`)}>Отчёт .docx</button>
        </div>
      </div>
      {tab === "results" && (results.data ? <HistoryTable items={results.data} /> : <Loading />)}
      {tab === "norms" && (norms.data ? <NormsBlock data={norms.data} /> : <Loading />)}
    </div>
  );
}

function LinkRequest({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [pick, setPick] = useState<Found | null>(null);
  const [disc, setDisc] = useState("");
  const { busy, run, feedback } = useAction();
  const search = () => run(async () => setFound(await api<Found[]>(`/api/coach/search?q=${encodeURIComponent(q)}`)));

  return (
    <div className="grid gap-4">
      {feedback}
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
        <Field label="Фамилия или имя" className="flex-1">{(id) => <input id={id} className="input" value={q} onChange={(e) => setQ(e.target.value)} minLength={2} required />}</Field>
        <button className="btn-secondary self-end" disabled={busy}>Найти</button>
      </form>
      {found && found.length === 0 && <p className="text-sm text-ink-soft">Никого не нашли. Проверьте написание фамилии.</p>}
      {found && found.length > 0 && !pick && (
        <ul className="cut-br divide-y divide-line bg-white px-4">
          {found.map((f) => (
            <li key={f.id}>
              <button className="w-full py-2 text-left hover:bg-field" onClick={() => setPick(f)}>
                <div className="font-medium">{f.full_name}</div>
                <div className="text-sm text-ink-soft">{f.birth_year} г. р., {f.organization}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pick && (
        <>
          <p className="text-sm">Спортсмен: <strong>{pick.full_name}</strong> <button className="btn-quiet btn-sm" onClick={() => setPick(null)}>изменить</button></p>
          <Select label="Дисциплина" value={disc} onChange={setDisc} options={pick.disciplines.map((d) => [d.id, d.name])} />
          <button className="btn-primary justify-self-start" disabled={busy || !disc}
                  onClick={() => run(() => api("/api/coach/links", { method: "POST", json: { athlete_id: pick.id, discipline_id: Number(disc) } }).then(onDone))}>
            Отправить запрос
          </button>
        </>
      )}
    </div>
  );
}
