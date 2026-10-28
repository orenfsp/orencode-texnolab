import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, download, postForm, type HistoryItem } from "../api";
import { useAuth } from "../auth";
import { Badge, Dialog, Empty, Field, Loading, PageHeader, Select, useAction } from "../components/ui";
import { useApi } from "../hooks";
import { APPEAL_STATUS, fmtDate, VIOLATION_DECISION } from "../labels";

export interface CaseItem {
  id: number; competition_id: number; competition: string; athlete_id: number; athlete: string; status?: string; decision?: string;
  text?: string; report?: string; decision_text?: string | null; submitted_by?: string; reported_by?: string;
  current_score?: number | null; current_place?: number | null; new_score?: number | null; created_at: string;
  evidence: { id: number; filename: string }[];
  history: { status: string; comment: string | null; at: string; by: string | null }[];
}

export function CaseHistory({ c, kind }: { c: CaseItem; kind: "appeal" | "violation" }) {
  const map = kind === "appeal" ? APPEAL_STATUS : VIOLATION_DECISION;
  return (
    <ol className="mt-3 space-y-1 border-l border-line pl-4 text-sm">
      {c.history.map((h, i) => (
        <li key={i}>
          <span className="text-ink-muted">{fmtDate(h.at)}</span> {map[h.status]?.label ?? h.status}
          {h.by && <span className="text-ink-muted">, {h.by}</span>}
          {h.comment && <div className="text-ink-soft">{h.comment}</div>}
        </li>
      ))}
    </ol>
  );
}

export function Evidence({ items }: { items: CaseItem["evidence"] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-sm">
      {items.map((e) => (
        <button key={e.id} className="btn-quiet btn-sm" onClick={() => download(`/api/evidence/${e.id}`, e.filename)}>{e.filename}</button>
      ))}
    </div>
  );
}

export default function Appeals() {
  const { me } = useAuth();
  const isCoach = me?.active_role === "coach";
  const list = useApi<CaseItem[]>("/api/appeals");
  const history = useApi<HistoryItem[]>(isCoach ? null : "/api/me/results");
  const pupils = useApi<{ athlete_id: number; full_name: string; status: string }[]>(isCoach ? "/api/me/athletes" : null);
  const [open, setOpen] = useState(false);
  const [comp, setComp] = useState("");
  const [athlete, setAthlete] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const { busy, run, feedback } = useAction();
  const [pupilHistory, setPupilHistory] = useState<HistoryItem[]>([]);

  const results = isCoach ? pupilHistory : history.data ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const fd = new FormData();
      fd.append("competition_id", comp);
      fd.append("text", text);
      if (isCoach) fd.append("athlete_id", athlete);
      Array.from(files ?? []).forEach((f) => fd.append("files", f));
      await postForm("/api/appeals", fd);
      setOpen(false);
      setText("");
      list.reload();
    }, "Апелляция подана. Решение придёт уведомлением.");
  };

  const loadPupil = async (id: string) => {
    setAthlete(id);
    setComp("");
    setPupilHistory(id ? await api<HistoryItem[]>(`/api/me/athletes/${id}/results`) : []);
  };

  return (
    <>
      <PageHeader title="Апелляции" lead="Не согласны с результатом? Опишите, что не так, и приложите доказательства: логи, скриншоты, видео."
                  actions={<button className="btn-primary" onClick={() => setOpen(true)}>Подать апелляцию</button>} />
      {feedback}
      {!list.data ? <Loading /> : list.data.length === 0 ? <Empty>Апелляций нет.</Empty> : (
        <ul className="space-y-8">
          {list.data.map((a) => (
            <li key={a.id} className="tile py-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={APPEAL_STATUS[a.status!].tone}>{APPEAL_STATUS[a.status!].label}</Badge>
                <span className="text-sm text-ink-muted">№ {a.id} от {fmtDate(a.created_at)}</span>
              </div>
              <h3 className="mt-2 font-sans text-base font-semibold"><Link to={`/protocols/${a.competition_id}`} className="text-ink hover:text-fed">{a.competition}</Link></h3>
              {isCoach && <div className="text-sm text-ink-soft">Спортсмен: {a.athlete}</div>}
              <p className="mt-2 max-w-3xl">{a.text}</p>
              <Evidence items={a.evidence} />
              {a.decision && <p className="mt-3 max-w-3xl rounded-xl bg-fed-tint px-4 py-3 text-sm"><span className="font-semibold">Решение:</span> {a.decision}</p>}
              <CaseHistory c={a} kind="appeal" />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Апелляция на результат">
        <form onSubmit={submit} className="grid gap-4">
          {isCoach && (
            <Select label="Спортсмен" value={athlete} onChange={loadPupil}
                    options={[...new Map((pupils.data ?? []).filter((p) => p.status === "active").map((p) => [p.athlete_id, p.full_name])).entries()]} />
          )}
          <Select label="Соревнование" value={comp} onChange={setComp} options={results.map((h) => [h.competition_id, `${h.competition_title} (${fmtDate(h.start_date)})`])} />
          <Field label="Что не так с результатом">{(id) => <textarea id={id} className="input min-h-28" required minLength={10} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <Field label="Доказательства" hint="Логи, скриншоты, видео: до 50 МБ на файл">{(id) => <input id={id} type="file" multiple className="text-sm" onChange={(e) => setFiles(e.target.files)} />}</Field>
          <div><button className="btn-primary" disabled={busy || !comp}>Отправить апелляцию</button></div>
        </form>
      </Dialog>
    </>
  );
}
