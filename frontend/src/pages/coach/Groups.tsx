import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Dialog, Empty, Field, Loading, Notice, PageHeader, RowMenu, Select, Table, Tabs, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { fmtDate, FORMAT, STAGE, STAGE_SHORT } from "../../labels";
import type { Norms } from "../athlete/Path";

type GroupTab = "members" | "journal" | "history";
interface Group { id: number; name: string; organization_id: number; organization: string; discipline: string; stage: string; year: number; coach: string; members_count: number }
interface GroupDetail extends Group {
  members: { athlete_id: number; full_name: string; birth_year: number | null; gender: string | null; enrolled_at: string }[];
  history: { athlete: string; enrolled_at: string; left_at: string; reason: string }[];
  sessions: { id: number; held_on: string; format: string; topic: string; hours: number; confirmation_url: string | null; attendees: number }[];
}

export default function Groups() {
  const { me } = useAuth();
  const dicts = useDictionaries();
  const groups = useApi<Group[]>("/api/groups");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", organization_id: "", discipline_id: "", stage: "np", year: String(new Date().getFullYear()) });
  const { busy, run, feedback } = useAction();
  const base = me?.active_role === "coach" ? "/coach/groups" : "/admin/groups";

  return (
    <>
      <PageHeader title="Группы и журнал занятий" lead="Группы по этапам спортивной подготовки, зачисление и перевод спортсменов, журнал занятий. Данные идут в отчёт о численности."
                  actions={me?.active_role === "coach" && <button className="btn-primary" onClick={() => setOpen(true)}>Создать группу</button>} />
      {feedback}
      {!groups.data ? <Loading /> : groups.data.length === 0 ? <Empty>Групп пока нет.</Empty> : (
        <Table head={<><th>Группа</th><th>Этап</th><th>Организация</th><th>Спортсменов</th></>}>
          {groups.data.map((g) => (
            <tr key={g.id}>
              <td><Link to={`${base}/${g.id}`} className="font-medium">{g.name}</Link><div className="text-xs text-ink-muted">{g.discipline}, {g.year}</div></td>
              <td><span title={STAGE[g.stage]}>{STAGE_SHORT[g.stage]}</span></td>
              <td>{g.organization}<div className="text-xs text-ink-muted">тренер {g.coach}</div></td>
              <td className="num">{g.members_count}</td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Новая группа">
        <div className="grid gap-4">
          <Field label="Название">{(id) => <input id={id} className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="УТЭ-3 «Алгоритмы»" />}</Field>
          <Select label="Организация" value={f.organization_id} onChange={(v) => setF({ ...f, organization_id: v })} options={dicts?.organizations.map((o) => [o.id, o.name]) ?? []} />
          <Select label="Дисциплина" value={f.discipline_id} onChange={(v) => setF({ ...f, discipline_id: v })} options={dicts?.disciplines.map((d) => [d.id, d.name]) ?? []} />
          <Select label="Этап подготовки" value={f.stage} onChange={(v) => setF({ ...f, stage: v })} options={Object.entries(STAGE)} />
          <Field label="Год набора">{(id) => <input id={id} type="number" className="input" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} />}</Field>
          <button className="btn-primary justify-self-start" disabled={busy || !f.name || !f.organization_id || !f.discipline_id}
                  onClick={() => run(() => api("/api/groups", { method: "POST", json: { ...f, organization_id: Number(f.organization_id), discipline_id: Number(f.discipline_id), year: Number(f.year) } })
                    .then(() => { setOpen(false); groups.reload(); }), "Группа создана")}>Создать группу</button>
        </div>
      </Dialog>
    </>
  );
}

export function GroupPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const g = useApi<GroupDetail>(`/api/groups/${id}`);
  const readiness = useApi<(Norms & { athlete_id: number; full_name: string })[]>(`/api/norms/readiness?group_id=${id}`);
  const allGroups = useApi<Group[]>("/api/groups");
  const pupils = useApi<{ athlete_id: number; full_name: string; status: string }[]>(me?.active_role === "coach" ? "/api/me/athletes" : null);
  const standards = useApi<{ id: number; name: string; unit: string; stage: string; gender: string | null; threshold: number }[]>("/api/norms/standards");
  const { busy, run, feedback } = useAction();
  const [dialog, setDialog] = useState<null | "enroll" | "session" | "norm" | { transfer: number } | { attest: number }>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [attendees, setAttendees] = useState<number[]>([]);
  const set = (k: string) => (v: string) => setForm({ ...form, [k]: v });
  const reload = () => { g.reload(); readiness.reload(); };
  const editable = me?.active_role === "coach" || me?.active_role === "admin";
  const [tab, setTab] = useState<GroupTab>("members");
  const readyCount = readiness.data?.filter((r) => r.ready).length ?? 0;

  if (!g.data) return <Loading />;
  const d = g.data;
  const memberIds = new Set(d.members.map((m) => m.athlete_id));
  const candidates = [...new Map((pupils.data ?? []).filter((p) => p.status === "active" && !memberIds.has(p.athlete_id)).map((p) => [p.athlete_id, p.full_name])).entries()];
  const nextGroups = (allGroups.data ?? []).filter((x) => x.id !== d.id);

  return (
    <>
      <PageHeader title={d.name} back={{ to: me?.active_role === "coach" ? "/coach/groups" : "/admin/groups", label: "Группы" }}
                  lead={`${STAGE[d.stage]}. ${d.discipline}, ${d.organization}, тренер ${d.coach}.`}
                  actions={editable && (
                    <>
                      <button className="btn-primary" onClick={() => { setForm({ held_on: new Date().toISOString().slice(0, 10), format: "offline", hours: "2" }); setAttendees(d.members.map((m) => m.athlete_id)); setDialog("session"); }}>Записать занятие</button>
                      <RowMenu label="Ещё" items={[
                        { label: "Зачислить спортсмена", onClick: () => { setForm({}); setDialog("enroll"); } },
                        { label: "Внести результат норматива", onClick: () => { setForm({}); setDialog("norm"); } },
                      ]} />
                    </>
                  )} />
      {feedback}
      {readyCount > 0 && editable && (
        <Notice tone="green">Готовы к переводу на следующий этап: {readyCount}. Откройте меню «Действия» у спортсмена и выберите «Аттестовать».</Notice>
      )}
      <Tabs tabs={[["members", `Состав (${d.members.length})`], ["journal", `Журнал занятий (${d.sessions.length})`], ...(d.history.length ? [["history", "Выбывшие"] as [GroupTab, string]] : [])]} value={tab} onChange={setTab} />
      {tab === "members" && (d.members.length === 0 ? <Empty>В группе пока никого.</Empty> : (
        <Table head={<><th>Спортсмен</th><th>Зачислен</th><th>Нормативы этапа</th><th /></>}>
          {d.members.map((m) => {
            const r = readiness.data?.find((x) => x.athlete_id === m.athlete_id);
            const passed = r?.requirements.filter((x) => x.passed).length ?? 0;
            return (
              <tr key={m.athlete_id}>
                <td className="font-medium">{m.full_name}<div className="text-sm font-normal text-ink-muted">{m.birth_year} г. р.</div></td>
                <td className="whitespace-nowrap">{fmtDate(m.enrolled_at)}</td>
                <td>{r ? (r.ready ? <Badge tone="green">Готов к переводу на {STAGE_SHORT[r.next_stage!]}</Badge> : `${passed} из ${r.requirements.length}`) : "…"}</td>
                <td className="text-right">
                  {editable && (
                    <RowMenu items={[
                      { label: `Аттестовать и перевести на ${r?.next_stage ? STAGE_SHORT[r.next_stage] : "следующий этап"}`, onClick: () => { setForm({}); setDialog({ attest: m.athlete_id }); }, hidden: !r?.ready },
                      { label: "Внести результат норматива", onClick: () => { setForm({ athlete_id: String(m.athlete_id) }); setDialog("norm"); } },
                      { label: "Перевести в другую группу", onClick: () => { setForm({}); setDialog({ transfer: m.athlete_id }); } },
                    ]} />
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      ))}
      {tab === "journal" && (d.sessions.length === 0 ? <Empty>Занятий пока не записано. Нажмите «Записать занятие».</Empty> : (
        <Table head={<><th>Дата</th><th>Тема</th><th>Формат</th><th className="text-right">Часы</th><th className="text-right">Были</th></>}>
          {d.sessions.map((s) => (
            <tr key={s.id}>
              <td className="whitespace-nowrap">{fmtDate(s.held_on)}</td>
              <td>{s.topic}</td>
              <td>{s.confirmation_url ? <a href={s.confirmation_url} target="_blank" rel="noreferrer">{FORMAT[s.format as keyof typeof FORMAT]}, запись</a> : FORMAT[s.format as keyof typeof FORMAT]}</td>
              <td className="tabular-nums text-right">{s.hours}</td>
              <td className="tabular-nums text-right">{s.attendees}</td>
            </tr>
          ))}
        </Table>
      ))}
      {tab === "history" && (
        <ul className="space-y-2">{d.history.map((h, i) => <li key={i}>{h.athlete}: {fmtDate(h.enrolled_at)} – {fmtDate(h.left_at)}, {h.reason.toLowerCase()}</li>)}</ul>
      )}

      <Dialog open={dialog === "enroll"} onClose={() => setDialog(null)} title="Зачисление в группу">
        {candidates.length === 0 ? <p className="text-sm text-ink-soft">Все ваши спортсмены уже в группе. Новых привяжите в разделе «Мои спортсмены».</p> : (
          <div className="grid gap-4">
            <Select label="Спортсмен" value={form.athlete_id} onChange={set("athlete_id")} options={candidates} />
            <button className="btn-primary justify-self-start" disabled={busy || !form.athlete_id}
                    onClick={() => run(() => api(`/api/groups/${d.id}/members`, { method: "POST", json: { athlete_id: Number(form.athlete_id) } }).then(() => { setDialog(null); reload(); }), "Спортсмен зачислен")}>Зачислить</button>
          </div>
        )}
      </Dialog>

      <Dialog open={dialog === "session"} onClose={() => setDialog(null)} title="Запись в журнале занятий">
        <div className="grid gap-4">
          <Field label="Дата">{(i) => <input id={i} type="date" className="input" value={form.held_on ?? ""} onChange={(e) => set("held_on")(e.target.value)} />}</Field>
          <Field label="Тема">{(i) => <input id={i} className="input" value={form.topic ?? ""} onChange={(e) => set("topic")(e.target.value)} />}</Field>
          <Select label="Формат" value={form.format} onChange={set("format")} options={[["offline", "Очно"], ["online", "Онлайн"], ["mixed", "Смешанный"]]} />
          <Field label="Часов">{(i) => <input id={i} type="number" step="0.5" className="input" value={form.hours ?? ""} onChange={(e) => set("hours")(e.target.value)} />}</Field>
          {form.format !== "offline" && (
            <Field label="Подтверждение онлайн-занятия" hint="Ссылка на запись занятия или лог соревновательной платформы">{(i) => <input id={i} type="url" className="input" value={form.confirmation_url ?? ""} onChange={(e) => set("confirmation_url")(e.target.value)} />}</Field>
          )}
          <fieldset>
            <legend className="label">Присутствовали</legend>
            {d.members.map((m) => (
              <label key={m.athlete_id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={attendees.includes(m.athlete_id)} onChange={(e) => setAttendees(e.target.checked ? [...attendees, m.athlete_id] : attendees.filter((x) => x !== m.athlete_id))} />
                {m.full_name}
              </label>
            ))}
          </fieldset>
          <button className="btn-primary justify-self-start" disabled={busy || !form.topic}
                  onClick={() => run(() => api(`/api/groups/${d.id}/sessions`, { method: "POST", json: { ...form, hours: Number(form.hours), confirmation_url: form.confirmation_url || null, attendee_ids: attendees } }).then(() => { setDialog(null); reload(); }), "Занятие записано")}>Записать</button>
        </div>
      </Dialog>

      <Dialog open={dialog === "norm"} onClose={() => setDialog(null)} title="Результат сдачи норматива">
        <div className="grid gap-4">
          <Select label="Спортсмен" value={form.athlete_id} onChange={set("athlete_id")} options={d.members.map((m) => [m.athlete_id, m.full_name])} />
          <Select label="Норматив" value={form.standard_id} onChange={set("standard_id")}
                  options={(standards.data ?? []).filter((s) => s.stage === d.stage).map((s) => [s.id, `${s.name}${s.gender ? (s.gender === "male" ? ", юноши" : ", девушки") : ""} (порог ${s.threshold} ${s.unit})`])} />
          <Field label="Результат">{(i) => <input id={i} type="number" step="0.1" className="input" value={form.value ?? ""} onChange={(e) => set("value")(e.target.value)} />}</Field>
          <p className="hint">Платформа сама сравнит результат с порогом и отметит, выполнен ли норматив.</p>
          <button className="btn-primary justify-self-start" disabled={busy || !form.athlete_id || !form.standard_id || !form.value}
                  onClick={() => run(async () => {
                    const r = await api<{ passed: boolean }>("/api/norms/results", { method: "POST", json: { athlete_id: Number(form.athlete_id), standard_id: Number(form.standard_id), value: Number(form.value) } });
                    setDialog(null);
                    reload();
                    if (!r.passed) throw new Error("Результат сохранён: норматив не выполнен");
                  }, "Результат сохранён: норматив выполнен")}>Сохранить результат</button>
        </div>
      </Dialog>

      <Dialog open={!!dialog && typeof dialog === "object" && "transfer" in dialog} onClose={() => setDialog(null)} title="Перевод или отчисление">
        <div className="grid gap-4">
          <Select label="Куда" value={form.to_group_id} onChange={set("to_group_id")} required={false} placeholder="Отчислить из группы"
                  options={nextGroups.map((x) => [x.id, `${x.name} (${STAGE_SHORT[x.stage]})`])} />
          <Field label="Основание">{(i) => <input id={i} className="input" value={form.reason ?? ""} onChange={(e) => set("reason")(e.target.value)} />}</Field>
          <button className="btn-primary justify-self-start" disabled={busy || !form.reason}
                  onClick={() => run(() => api(`/api/groups/${d.id}/members/${(dialog as { transfer: number }).transfer}/transfer`, { method: "POST", json: { to_group_id: form.to_group_id ? Number(form.to_group_id) : null, reason: form.reason } })
                    .then(() => { setDialog(null); reload(); }), form.to_group_id ? "Спортсмен переведён" : "Спортсмен отчислен")}>Подтвердить</button>
        </div>
      </Dialog>

      <Dialog open={!!dialog && typeof dialog === "object" && "attest" in dialog} onClose={() => setDialog(null)} title="Промежуточная аттестация">
        <div className="grid gap-4">
          <p className="text-sm text-ink-soft">Все нормативы этапа выполнены. Спортсмен будет переведён на следующий этап подготовки.</p>
          <Select label="Перевести в группу" value={form.to_group_id} onChange={set("to_group_id")} required={false} placeholder="Оставить в текущей группе"
                  options={nextGroups.map((x) => [x.id, `${x.name} (${STAGE_SHORT[x.stage]})`])} />
          <Field label="Комментарий">{(i) => <input id={i} className="input" value={form.comment ?? ""} onChange={(e) => set("comment")(e.target.value)} />}</Field>
          <button className="btn-primary justify-self-start" disabled={busy}
                  onClick={() => run(() => api("/api/attestations", { method: "POST", json: { athlete_id: (dialog as { attest: number }).attest, comment: form.comment || null, to_group_id: form.to_group_id ? Number(form.to_group_id) : null } })
                    .then(() => { setDialog(null); reload(); allGroups.reload(); }), "Аттестация оформлена, этап обновлён")}>Оформить перевод</button>
        </div>
      </Dialog>
    </>
  );
}
