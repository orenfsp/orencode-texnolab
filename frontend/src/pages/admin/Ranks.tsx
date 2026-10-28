import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Dialog, Empty, Field, Loading, PageHeader, Place, Table, Tabs, useAction } from "../../components/ui";
import { useApi } from "../../hooks";
import { fmtDate, REQUEST_STATUS } from "../../labels";

interface Req { id: number; athlete_name: string; submitted_by: string; discipline: string; rank: string; kind: string; competition_id: number; competition: string; place: number | null; score: number | null; evsk_hint: string | null; status: string; comment: string | null; created_at: string }
interface Candidate { athlete_name: string; discipline: string; competition_id: number; competition: string; date: string; place: number; current_rank: string | null; candidate_rank: string; has_request: boolean }
interface Assigned { id: number; athlete_name: string; discipline: string; rank: string; assigned_at: string; order_number: string; valid_until: string | null; days_left: number | null; basis: string | null }

type Tab = "requests" | "candidates" | "assigned";

export default function AdminRanks() {
  const [tab, setTab] = useState<Tab>("requests");
  return (
    <>
      <PageHeader title="Разряды" lead="Заявки тренеров и спортсменов, кандидаты по протоколам и реестр присвоенных разрядов. Заявку в Госуслугах федерация формирует вне платформы по этим данным." />
      <Tabs tabs={[["requests", "Заявки"], ["candidates", "Кандидаты по ЕВСК"], ["assigned", "Присвоенные"]]} value={tab} onChange={setTab} />
      {tab === "requests" && <Requests />}
      {tab === "candidates" && <Candidates />}
      {tab === "assigned" && <AssignedList />}
    </>
  );
}

function Requests() {
  const { me } = useAuth();
  const [status, setStatus] = useState("submitted");
  const list = useApi<Req[]>(`/api/admin/rank-requests${status ? `?status=${status}` : ""}`);
  const [target, setTarget] = useState<{ req: Req; approve: boolean } | null>(null);
  const [order, setOrder] = useState({ order_number: "", assigned_at: new Date().toISOString().slice(0, 10), comment: "" });
  const { busy, run, feedback } = useAction();

  return (
    <>
      {feedback}
      <div className="mb-4 flex gap-2">
        {[["submitted", "На рассмотрении"], ["", "Все"]].map(([v, l]) => (
          <button key={l} className={status === v ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      {!list.data ? <Loading /> : list.data.length === 0 ? <Empty>Заявок нет.</Empty> : (
        <Table head={<><th>Спортсмен</th><th>Запрошен</th><th>Основание</th><th>По ЕВСК</th><th>Статус</th><th /></>}>
          {list.data.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.athlete_name}<div className="text-xs font-normal text-ink-muted">подал {r.submitted_by}, {fmtDate(r.created_at)}</div></td>
              <td>{r.rank}<div className="text-xs text-ink-muted">{r.kind === "assign" ? "присвоение" : "подтверждение"}, {r.discipline.toLowerCase()}</div></td>
              <td className="text-sm"><Link to={`/protocols/${r.competition_id}`}>{r.competition}</Link><div className="mt-1 flex items-center gap-2"><Place place={r.place} size="sm" /> {r.score} баллов</div></td>
              <td className="text-sm">{r.evsk_hint ?? <span className="text-signal">не соответствует</span>}</td>
              <td><Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>{r.comment && <div className="mt-1 text-xs text-ink-soft">{r.comment}</div>}</td>
              <td className="whitespace-nowrap text-right">
                {me?.active_role === "admin" && r.status === "submitted" && (
                  <>
                    <button className="btn-primary btn-sm" onClick={() => setTarget({ req: r, approve: true })}>Присвоить</button>{" "}
                    <button className="btn-danger btn-sm" onClick={() => setTarget({ req: r, approve: false })}>Отказать</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title={target?.approve ? "Присвоение разряда" : "Отказ в присвоении"}>
        <p className="mb-4 text-sm text-ink-soft">{target?.req.athlete_name}: {target?.req.rank.toLowerCase()}.</p>
        <div className="grid gap-4">
          {target?.approve ? (
            <>
              <Field label="Номер приказа">{(id) => <input id={id} className="input" value={order.order_number} onChange={(e) => setOrder({ ...order, order_number: e.target.value })} />}</Field>
              <Field label="Дата присвоения" hint="Срок действия рассчитается автоматически по справочнику разрядов">{(id) => <input id={id} type="date" className="input" value={order.assigned_at} onChange={(e) => setOrder({ ...order, assigned_at: e.target.value })} />}</Field>
            </>
          ) : (
            <Field label="Причина отказа">{(id) => <textarea id={id} className="input" value={order.comment} onChange={(e) => setOrder({ ...order, comment: e.target.value })} />}</Field>
          )}
          <button className={target?.approve ? "btn-primary justify-self-start" : "btn-danger justify-self-start"} disabled={busy || (target?.approve ? !order.order_number : !order.comment)}
                  onClick={() => run(() => api(`/api/admin/rank-requests/${target!.req.id}/${target!.approve ? "approve" : "reject"}`, { method: "POST", json: target!.approve ? { order_number: order.order_number, assigned_at: order.assigned_at } : { comment: order.comment } })
                    .then(() => { setTarget(null); list.reload(); }), target?.approve ? "Разряд присвоен" : "Отказ отправлен")}>
            {target?.approve ? "Присвоить разряд" : "Отказать"}
          </button>
        </div>
      </Dialog>
    </>
  );
}

function Candidates() {
  const { data } = useApi<Candidate[]>("/api/admin/rank-candidates");
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty>В протоколах за последний год нет результатов под разрядные требования.</Empty>;
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">Спортсмены, чей результат в протоколе может соответствовать разрядным требованиям ЕВСК и выше текущего разряда. Нормы ЕВСК в демо упрощены.</p>
      <Table head={<><th>Место</th><th>Спортсмен</th><th>Соревнование</th><th>Сейчас</th><th>Может претендовать</th></>}>
        {data.map((c, i) => (
          <tr key={i}>
            <td><Place place={c.place} /></td>
            <td className="font-medium">{c.athlete_name}<div className="text-xs font-normal text-ink-muted">{c.discipline}</div></td>
            <td className="text-sm"><Link to={`/protocols/${c.competition_id}`}>{c.competition}</Link><div className="text-xs text-ink-muted">{fmtDate(c.date)}</div></td>
            <td className="text-sm">{c.current_rank ?? "б/р"}</td>
            <td><Badge tone="blue">{c.candidate_rank}</Badge>{c.has_request && <div className="mt-1 text-xs text-ink-muted">заявка подана</div>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function AssignedList() {
  const [expiring, setExpiring] = useState(false);
  const { data } = useApi<Assigned[]>(`/api/admin/ranks${expiring ? "?expiring_days=90" : ""}`);
  return (
    <>
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={expiring} onChange={(e) => setExpiring(e.target.checked)} />Только истекающие в ближайшие 90 дней</label>
      {!data ? <Loading /> : data.length === 0 ? <Empty>Нет разрядов по фильтру.</Empty> : (
        <Table head={<><th>Спортсмен</th><th>Разряд</th><th>Приказ</th><th>Действует до</th><th>За что получен</th></>}>
          {data.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.athlete_name}<div className="text-xs font-normal text-ink-muted">{r.discipline}</div></td>
              <td>{r.rank}</td>
              <td className="text-sm">{r.order_number}<div className="text-xs text-ink-muted">от {fmtDate(r.assigned_at)}</div></td>
              <td className={r.days_left !== null && r.days_left <= 60 ? "font-semibold text-signal" : ""}>{r.valid_until ? fmtDate(r.valid_until) : "бессрочно"}</td>
              <td className="text-sm">{r.basis ?? "-"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
