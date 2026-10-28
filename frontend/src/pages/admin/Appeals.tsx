import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Badge, Dialog, Empty, Field, Loading, PageHeader, Select, Table, Tabs, useAction } from "../../components/ui";
import { useApi } from "../../hooks";
import { APPEAL_STATUS, fmtDate, VIOLATION_DECISION } from "../../labels";
import { CaseHistory, Evidence, type CaseItem } from "../Appeals";

interface Disq { id: number; athlete_name: string; date_from: string; date_to: string | null; reason: string; active: boolean }
type Tab = "appeals" | "violations" | "disq";

export default function AdminAppeals() {
  const [tab, setTab] = useState<Tab>("appeals");
  return (
    <>
      <PageHeader title="Апелляции и нарушения" lead="Каждый шаг фиксируется в истории, участники получают уведомления. Удовлетворённая апелляция и решение по нарушению корректируют протокол." />
      <Tabs tabs={[["appeals", "Апелляции"], ["violations", "Нарушения"], ["disq", "Дисквалификации"]]} value={tab} onChange={setTab} />
      {tab === "appeals" && <AppealList />}
      {tab === "violations" && <ViolationList />}
      {tab === "disq" && <DisqList />}
    </>
  );
}

function AppealList() {
  const list = useApi<CaseItem[]>("/api/appeals");
  const [target, setTarget] = useState<CaseItem | null>(null);
  const [f, setF] = useState({ status: "accepted", decision: "", new_score: "" });
  const { busy, run, feedback } = useAction();
  const decide = (a: CaseItem, body: object, msg: string) => run(() => api(`/api/appeals/${a.id}/decision`, { method: "POST", json: body }).then(() => { setTarget(null); list.reload(); }), msg);

  if (!list.data) return <Loading />;
  return (
    <>
      {feedback}
      {list.data.length === 0 ? <Empty>Апелляций нет.</Empty> : (
        <ul className="space-y-8">
          {list.data.map((a) => (
            <li key={a.id} className="tile py-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={APPEAL_STATUS[a.status!].tone}>{APPEAL_STATUS[a.status!].label}</Badge>
                <span className="text-sm text-ink-muted">№ {a.id} от {fmtDate(a.created_at)}, подал {a.submitted_by}</span>
              </div>
              <h3 className="mt-2 font-sans text-base font-semibold">{a.athlete}: <Link to={`/admin/competitions/${a.competition_id}`}>{a.competition}</Link></h3>
              <p className="text-sm text-ink-soft">Сейчас в протоколе: место {a.current_place ?? "-"}, баллы {a.current_score ?? "-"}</p>
              <p className="mt-2 max-w-3xl">{a.text}</p>
              <Evidence items={a.evidence} />
              {a.decision && <p className="mt-3 max-w-3xl rounded-xl bg-fed-tint px-4 py-3 text-sm"><span className="font-semibold">Решение:</span> {a.decision}</p>}
              <CaseHistory c={a} kind="appeal" />
              {(a.status === "submitted" || a.status === "under_review") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.status === "submitted" && <button className="btn-secondary btn-sm" disabled={busy} onClick={() => decide(a, { status: "under_review" }, "Апелляция принята к рассмотрению")}>Принять к рассмотрению</button>}
                  <button className="btn-primary btn-sm" onClick={() => { setTarget(a); setF({ status: "accepted", decision: "", new_score: String(a.current_score ?? "") }); }}>Вынести решение</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title="Решение по апелляции">
        <div className="grid gap-4">
          <Select label="Решение" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[["accepted", "Удовлетворить"], ["rejected", "Отклонить"]]} />
          <Field label="Обоснование">{(id) => <textarea id={id} className="input min-h-24" value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })} />}</Field>
          {f.status === "accepted" && (
            <Field label="Новые баллы участника" hint="Оставьте прежнее значение, если протокол не меняется. Места пересчитаются автоматически.">
              {(id) => <input id={id} type="number" step="0.1" className="input" value={f.new_score} onChange={(e) => setF({ ...f, new_score: e.target.value })} />}
            </Field>
          )}
          <button className="btn-primary justify-self-start" disabled={busy || !f.decision}
                  onClick={() => decide(target!, {
                    status: f.status, decision: f.decision,
                    new_score: f.status === "accepted" && f.new_score !== "" && Number(f.new_score) !== target!.current_score ? Number(f.new_score) : null,
                  }, "Решение вынесено, участники уведомлены")}>Сохранить решение</button>
        </div>
      </Dialog>
    </>
  );
}

function ViolationList() {
  const list = useApi<CaseItem[]>("/api/violations");
  const [target, setTarget] = useState<CaseItem | null>(null);
  const [f, setF] = useState({ decision: "warning", decision_text: "", disqualification_until: "" });
  const { busy, run, feedback } = useAction();

  if (!list.data) return <Loading />;
  return (
    <>
      {feedback}
      {list.data.length === 0 ? <Empty>Рапортов о нарушениях нет. Рапорт подаётся из карточки соревнования или кабинета судьи.</Empty> : (
        <ul className="space-y-8">
          {list.data.map((v) => (
            <li key={v.id} className="tile py-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={VIOLATION_DECISION[v.decision!].tone}>{VIOLATION_DECISION[v.decision!].label}</Badge>
                <span className="text-sm text-ink-muted">Рапорт № {v.id} от {fmtDate(v.created_at)}, {v.reported_by}</span>
              </div>
              <h3 className="mt-2 font-sans text-base font-semibold">{v.athlete}: <Link to={`/admin/competitions/${v.competition_id}`}>{v.competition}</Link></h3>
              <p className="mt-2 max-w-3xl">{v.report}</p>
              <Evidence items={v.evidence} />
              {v.decision_text && <p className="mt-3 max-w-3xl rounded-xl bg-fed-tint px-4 py-3 text-sm"><span className="font-semibold">Решение:</span> {v.decision_text}</p>}
              <CaseHistory c={v} kind="violation" />
              {v.decision === "pending" && <button className="btn-primary btn-sm mt-3" onClick={() => { setTarget(v); setF({ decision: "warning", decision_text: "", disqualification_until: "" }); }}>Вынести решение</button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title="Решение по нарушению">
        <div className="grid gap-4">
          <Select label="Решение" value={f.decision} onChange={(v) => setF({ ...f, decision: v })}
                  options={[["no_violation", "Нарушение не подтверждено"], ["warning", "Предупреждение"], ["technical_defeat", "Техническое поражение"], ["disqualification", "Дисквалификация"]]} />
          <Field label="Обоснование">{(id) => <textarea id={id} className="input min-h-24" value={f.decision_text} onChange={(e) => setF({ ...f, decision_text: e.target.value })} />}</Field>
          {f.decision === "disqualification" && (
            <Field label="Дисквалификация до" hint="Пусто - бессрочно">{(id) => <input id={id} type="date" className="input" value={f.disqualification_until} onChange={(e) => setF({ ...f, disqualification_until: e.target.value })} />}</Field>
          )}
          {(f.decision === "technical_defeat" || f.decision === "disqualification") && <p className="text-sm text-signal">Результат участника будет снят, места в протоколе пересчитаются.</p>}
          <button className="btn-primary justify-self-start" disabled={busy || !f.decision_text}
                  onClick={() => run(() => api(`/api/violations/${target!.id}/decision`, { method: "POST", json: { ...f, disqualification_until: f.disqualification_until || null } })
                    .then(() => { setTarget(null); list.reload(); }), "Решение сохранено")}>Сохранить решение</button>
        </div>
      </Dialog>
    </>
  );
}

function DisqList() {
  const { data } = useApi<Disq[]>("/api/admin/disqualifications");
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty>Дисквалификаций нет.</Empty>;
  return (
    <Table head={<><th>Спортсмен</th><th>Период</th><th>Основание</th><th /></>}>
      {data.map((d) => (
        <tr key={d.id}>
          <td className="font-medium">{d.athlete_name}</td>
          <td className="whitespace-nowrap">{fmtDate(d.date_from)} – {d.date_to ? fmtDate(d.date_to) : "бессрочно"}</td>
          <td className="text-sm">{d.reason}</td>
          <td>{d.active ? <Badge tone="rose">Действует</Badge> : <Badge>Истекла</Badge>}</td>
        </tr>
      ))}
    </Table>
  );
}
