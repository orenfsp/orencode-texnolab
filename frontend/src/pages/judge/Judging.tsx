import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, dl, postForm, type CompetitionStatus } from "../../api";
import { useAuth } from "../../auth";
import { DeadlineStrip } from "../../components/Deadlines";
import { Badge, Dialog, DownloadButtons, Empty, Field, Loading, PageHeader, Section, Select, Table, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { COMPETITION_STATUS, daysWord, fmtDate, REQUEST_STATUS } from "../../labels";

interface Assignment { competition_id: number; title: string; start_date: string; status: CompetitionStatus; position: string }
interface MyJudge {
  qualification: { category: string | null; assigned_at: string | null; order_number: string | null; valid_until: string | null; days_left: number | null; competitions: number };
  requests: { id: number; category: string; kind: string; status: string; comment: string | null; created_at: string }[];
}

export default function Judging() {
  const { me } = useAuth();
  const dicts = useDictionaries();
  const mine = useApi<MyJudge>("/api/me/judge");
  const assignments = useApi<Assignment[]>("/api/me/judging");
  const [requestOpen, setRequestOpen] = useState(false);
  const [report, setReport] = useState<Assignment | null>(null);
  const [f, setF] = useState({ category_id: "", kind: "assign", justification: "" });
  const { busy, run, feedback } = useAction();

  const upcoming = assignments.data?.filter((a) => a.status !== "completed" && a.status !== "cancelled") ?? [];
  const past = assignments.data?.filter((a) => a.status === "completed") ?? [];
  const q = mine.data?.qualification;
  const expiring = q?.days_left !== null && q?.days_left !== undefined && q.days_left <= 90;
  const pending = mine.data?.requests.some((r) => r.status === "submitted");

  return (
    <>
      <PageHeader title="Судейство" actions={me && (
        <DownloadButtons items={[
          { label: "Отчёт о судействе .docx", onClick: dl(`/api/judges/${me.id}/report.docx`, "судейство.docx") },
          { label: ".xlsx", onClick: dl(`/api/judges/${me.id}/report.xlsx`, "судейство.xlsx") },
        ]} />
      )} />
      {feedback}
      <DeadlineStrip />
      <div>
        <div>
          <Section title="Судейская категория" actions={<button className="btn-secondary btn-sm" disabled={pending} onClick={() => setRequestOpen(true)}>Подать заявку на категорию</button>}>
            {!mine.data ? <Loading /> : (
              <div className="tile">
                <div className="text-lg font-extrabold text-plum">{q?.category ?? "Категория не присвоена"}</div>
                {q?.assigned_at && <div className="mt-1 text-sm text-ink-soft">Присвоена {fmtDate(q.assigned_at)}, приказ {q.order_number}</div>}
                {q?.valid_until && (
                  <div className={`mt-1 text-sm ${expiring ? "font-semibold text-signal" : ""}`}>
                    Действует до {fmtDate(q.valid_until)}{expiring && `, осталось ${q.days_left} ${daysWord(q.days_left!)} - подайте заявку на подтверждение`}
                  </div>
                )}
                <div className="mt-1 text-sm text-ink-soft">Отсужено соревнований: {q?.competitions}</div>
              </div>
            )}
            {mine.data && mine.data.requests.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm">
                {mine.data.requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                    {r.kind === "assign" ? "Присвоение" : "Подтверждение"}: {r.category.toLowerCase()}, от {fmtDate(r.created_at)}
                    {r.comment && <span className="text-ink-soft">({r.comment})</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Назначения">
            {upcoming.length === 0 ? <Empty>Назначений на будущие соревнования нет.</Empty> : <AssignmentTable items={upcoming} onReport={setReport} />}
          </Section>
          <Section title="Мои соревнования">
            {past.length === 0 ? <Empty>Отсуженных соревнований пока нет.</Empty> : <AssignmentTable items={past} onReport={setReport} />}
          </Section>
        </div>
      </div>

      <Dialog open={requestOpen} onClose={() => setRequestOpen(false)} title="Заявка на судейскую категорию">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); run(() => api("/api/me/judge-requests", { method: "POST", json: { ...f, category_id: Number(f.category_id) } }).then(() => { setRequestOpen(false); mine.reload(); }), "Заявка отправлена в федерацию"); }}>
          <Select label="Категория" value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} options={dicts?.judge_categories.map((c) => [c.id, c.name]) ?? []} />
          <Select label="Тип заявки" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[["assign", "Присвоение"], ["confirm", "Подтверждение"]]} />
          <Field label="Обоснование" hint="Например: соревнования, на которых вы работали, семинары">{(id) => <textarea id={id} className="input min-h-24" value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} />}</Field>
          <button className="btn-primary justify-self-start" disabled={busy || !f.category_id}>Отправить заявку</button>
        </form>
      </Dialog>
      <Dialog open={!!report} onClose={() => setReport(null)} title="Рапорт о нарушении">
        {report && <ViolationForm comp={report} onDone={() => setReport(null)} />}
      </Dialog>
    </>
  );
}

function AssignmentTable({ items, onReport }: { items: Assignment[]; onReport: (a: Assignment) => void }) {
  return (
    <Table head={<><th>Соревнование</th><th>Дата</th><th>Должность</th><th>Статус</th><th /></>}>
      {items.map((a) => (
        <tr key={a.competition_id}>
          <td>{a.status === "completed" ? <Link to={`/protocols/${a.competition_id}`}>{a.title}</Link> : a.title}</td>
          <td className="whitespace-nowrap">{fmtDate(a.start_date)}</td>
          <td>{a.position}</td>
          <td><Badge tone={COMPETITION_STATUS[a.status].tone}>{COMPETITION_STATUS[a.status].label}</Badge></td>
          <td className="text-right"><button className="btn-quiet btn-sm" onClick={() => onReport(a)}>Рапорт о нарушении</button></td>
        </tr>
      ))}
    </Table>
  );
}

interface ProtocolLite { rows: { athlete_id: number; full_name: string }[] }

export function ViolationForm({ comp, onDone }: { comp: { competition_id: number; title: string }; onDone: () => void }) {
  const participants = useApi<ProtocolLite>(`/api/competitions/${comp.competition_id}/protocol`);
  const apps = useApi<{ athlete_id: number; athlete_name: string; status: string }[]>(participants.error ? `/api/competitions/${comp.competition_id}/applications` : null);
  const [athlete, setAthlete] = useState("");
  const [report, setReport] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const { busy, run, feedback } = useAction();
  const options: [number, string][] = participants.data
    ? participants.data.rows.map((r) => [r.athlete_id, r.full_name])
    : (apps.data ?? []).filter((a) => a.status === "approved").map((a) => [a.athlete_id, a.athlete_name]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("competition_id", String(comp.competition_id));
    fd.append("athlete_id", athlete);
    fd.append("report", report);
    Array.from(files ?? []).forEach((f) => fd.append("files", f));
    run(() => postForm("/api/violations", fd).then(onDone), "Рапорт зарегистрирован");
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {feedback}
      <p className="text-sm text-ink-soft">{comp.title}</p>
      <Select label="Участник" value={athlete} onChange={setAthlete} options={options} />
      <Field label="Что произошло">{(id) => <textarea id={id} className="input min-h-28" required minLength={10} value={report} onChange={(e) => setReport(e.target.value)} />}</Field>
      <Field label="Доказательства" hint="Логи, скриншоты, видео">{(id) => <input id={id} type="file" multiple className="text-sm" onChange={(e) => setFiles(e.target.files)} />}</Field>
      <button className="btn-primary justify-self-start" disabled={busy || !athlete}>Зарегистрировать рапорт</button>
    </form>
  );
}
