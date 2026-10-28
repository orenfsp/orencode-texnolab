import { useState } from "react";
import { api, dl } from "../../api";
import { Badge, Dialog, Empty, Field, Loading, PageHeader, RowMenu, Section, Select, Table, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { fmtDate, REQUEST_STATUS } from "../../labels";

interface Judge { id: number; full_name: string; municipality: string | null; category: string | null; order_number: string | null; assigned_at: string | null; valid_until: string | null; days_left: number | null; competitions: number }
interface Req { id: number; judge_id: number; judge_name: string; category: string; kind: string; justification: string | null; status: string; comment: string | null; created_at: string }

export default function AdminJudges() {
  const dicts = useDictionaries();
  const judges = useApi<Judge[]>("/api/admin/registry/judges");
  const requests = useApi<Req[]>("/api/admin/judge-requests");
  const [assign, setAssign] = useState<Judge | null>(null);
  const [decide, setDecide] = useState<{ req: Req; approve: boolean } | null>(null);
  const [f, setF] = useState({ category_id: "", order_number: "", assigned_at: new Date().toISOString().slice(0, 10), comment: "" });
  const { busy, run, feedback } = useAction();
  const reload = () => { judges.reload(); requests.reload(); };
  const pending = requests.data?.filter((r) => r.status === "submitted") ?? [];

  return (
    <>
      <PageHeader title="Судьи и категории" lead="Реестр судей с категориями и сроками их действия, рассмотрение заявок на присвоение и подтверждение." />
      {feedback}
      <Section title="Заявки на категорию">
        {pending.length === 0 ? <Empty>Новых заявок нет.</Empty> : (
          <Table head={<><th>Судья</th><th>Категория</th><th>Обоснование</th><th /></>}>
            {pending.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.judge_name}<div className="text-xs font-normal text-ink-muted">{fmtDate(r.created_at)}</div></td>
                <td>{r.category}<div className="text-xs text-ink-muted">{r.kind === "assign" ? "присвоение" : "подтверждение"}</div></td>
                <td className="max-w-sm text-sm">{r.justification ?? "-"}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-primary btn-sm" onClick={() => setDecide({ req: r, approve: true })}>Присвоить</button>{" "}
                  <button className="btn-danger btn-sm" onClick={() => setDecide({ req: r, approve: false })}>Отказать</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Section title="Реестр судей">
        {!judges.data ? <Loading /> : (
          <Table head={<><th>Судья</th><th>Категория</th><th>Действует до</th><th>Отсужено</th><th /></>}>
            {judges.data.map((j) => (
              <tr key={j.id}>
                <td className="font-medium">{j.full_name}<div className="text-xs font-normal text-ink-muted">{j.municipality}</div></td>
                <td className="text-sm">{j.category ?? "-"}{j.order_number && <div className="text-xs text-ink-muted">приказ {j.order_number} от {fmtDate(j.assigned_at)}</div>}</td>
                <td className={j.days_left !== null && j.days_left <= 90 ? "font-semibold text-signal" : ""}>{fmtDate(j.valid_until)}</td>
                <td className="num">{j.competitions}</td>
                <td className="text-right">
                  <RowMenu items={[
                    { label: "Присвоить категорию", onClick: () => { setAssign(j); setF({ ...f, category_id: "" }); } },
                    { label: "Отчёт о судействе .docx", onClick: dl(`/api/judges/${j.id}/report.docx`, `судейство_${j.id}.docx`) },
                  ]} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      {requests.data && requests.data.some((r) => r.status !== "submitted") && (
        <Section title="Рассмотренные заявки">
          <ul className="space-y-1 text-sm">
            {requests.data.filter((r) => r.status !== "submitted").map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2"><Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>{r.judge_name}: {r.category.toLowerCase()}</li>
            ))}
          </ul>
        </Section>
      )}
      <Dialog open={!!assign} onClose={() => setAssign(null)} title="Присвоение судейской категории">
        <p className="mb-4 text-sm text-ink-soft">{assign?.full_name}</p>
        <div className="grid gap-4">
          <Select label="Категория" value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} options={dicts?.judge_categories.map((c) => [c.id, c.name]) ?? []} />
          <Field label="Номер приказа">{(id) => <input id={id} className="input" value={f.order_number} onChange={(e) => setF({ ...f, order_number: e.target.value })} />}</Field>
          <Field label="Дата присвоения">{(id) => <input id={id} type="date" className="input" value={f.assigned_at} onChange={(e) => setF({ ...f, assigned_at: e.target.value })} />}</Field>
          <button className="btn-primary justify-self-start" disabled={busy || !f.category_id || !f.order_number}
                  onClick={() => run(() => api(`/api/admin/judges/${assign!.id}/qualification`, { method: "POST", json: { category_id: Number(f.category_id), order_number: f.order_number, assigned_at: f.assigned_at } })
                    .then(() => { setAssign(null); reload(); }), "Категория присвоена")}>Присвоить</button>
        </div>
      </Dialog>
      <Dialog open={!!decide} onClose={() => setDecide(null)} title={decide?.approve ? "Присвоение по заявке" : "Отказ"}>
        <p className="mb-4 text-sm text-ink-soft">{decide?.req.judge_name}: {decide?.req.category.toLowerCase()}</p>
        <div className="grid gap-4">
          {decide?.approve ? (
            <>
              <Field label="Номер приказа">{(id) => <input id={id} className="input" value={f.order_number} onChange={(e) => setF({ ...f, order_number: e.target.value })} />}</Field>
              <Field label="Дата присвоения">{(id) => <input id={id} type="date" className="input" value={f.assigned_at} onChange={(e) => setF({ ...f, assigned_at: e.target.value })} />}</Field>
            </>
          ) : <Field label="Причина отказа">{(id) => <textarea id={id} className="input" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />}</Field>}
          <button className="btn-primary justify-self-start" disabled={busy || (decide?.approve ? !f.order_number : !f.comment)}
                  onClick={() => run(() => api(`/api/admin/judge-requests/${decide!.req.id}/${decide!.approve ? "approve" : "reject"}`, { method: "POST", json: decide!.approve ? { order_number: f.order_number, assigned_at: f.assigned_at } : { comment: f.comment } })
                    .then(() => { setDecide(null); reload(); }), "Решение сохранено, судья получил уведомление")}>Подтвердить</button>
        </div>
      </Dialog>
    </>
  );
}
