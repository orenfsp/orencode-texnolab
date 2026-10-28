import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, dl } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Dialog, DownloadButtons, Empty, Field, Loading, PageHeader, Section, Select, Table, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { fmtDate } from "../../labels";
import { RatingTable, useRating } from "./Rating";

interface Member { athlete_id: number; full_name: string; birth_year: number | null; organization: string | null; rank: string | null; role: "main" | "reserve"; rating_points: number | null }
interface Team { id: number; title: string; discipline_id: number; discipline: string; season: number; age_group_id: number | null; age_group: string | null; status: "draft" | "approved"; order_number: string | null; order_date: string | null; members: Member[] }

export default function Teams() {
  const { me } = useAuth();
  const dicts = useDictionaries();
  const teams = useApi<Team[]>("/api/teams");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ discipline_id: "", season: String(new Date().getFullYear()), age_group_id: "" });
  const { busy, run, feedback } = useAction();
  const base = me?.active_role === "admin" || me?.active_role === "ministry" ? "/admin/teams" : "/teams";

  return (
    <>
      <PageHeader title="Сборная области" lead="Состав формируется вручную по рейтингу сезона. Платформа выдаёт список сборной и проект приказа."
                  actions={me?.active_role === "admin" && <button className="btn-primary" onClick={() => setOpen(true)}>Сформировать сборную</button>} />
      {feedback}
      {!teams.data ? <Loading /> : teams.data.length === 0 ? <Empty>Сборных пока нет.</Empty> : (
        <Table head={<><th>Сборная</th><th>Сезон</th><th>Состав</th><th>Статус</th></>}>
          {teams.data.map((t) => (
            <tr key={t.id}>
              <td><Link to={`${base}/${t.id}`} className="font-medium">{t.title}</Link>{t.age_group && <div className="text-xs text-ink-muted">{t.age_group}</div>}</td>
              <td className="num">{t.season}</td>
              <td className="num">{t.members.length}</td>
              <td>{t.status === "approved" ? <Badge tone="green">Утверждена, приказ {t.order_number}</Badge> : <Badge tone="amber">Черновик</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Новая сборная">
        <div className="grid gap-4">
          <Select label="Дисциплина" value={f.discipline_id} onChange={(v) => setF({ ...f, discipline_id: v })} options={dicts?.disciplines.map((d) => [d.id, d.name]) ?? []} />
          <Field label="Сезон">{(id) => <input id={id} type="number" className="input" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} />}</Field>
          <Select label="Возрастная группа" value={f.age_group_id} onChange={(v) => setF({ ...f, age_group_id: v })} required={false} placeholder="Все возрасты" options={dicts?.age_groups.map((d) => [d.id, d.name]) ?? []} />
          <button className="btn-primary justify-self-start" disabled={busy || !f.discipline_id}
                  onClick={() => run(async () => {
                    const t = await api<Team>("/api/teams", { method: "POST", json: { discipline_id: Number(f.discipline_id), season: Number(f.season), age_group_id: f.age_group_id ? Number(f.age_group_id) : null } });
                    window.location.assign(`${base}/${t.id}`);
                  })}>Создать и перейти к составу</button>
        </div>
      </Dialog>
    </>
  );
}

export function TeamPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const team = useApi<Team>(`/api/teams/${id}`);
  const t = team.data;
  const rating = useRating(t ? String(t.discipline_id) : "", t ? String(t.season) : "", t?.age_group_id ? String(t.age_group_id) : "");
  const [selected, setSelected] = useState<Map<number, "main" | "reserve">>(new Map());
  const [approve, setApprove] = useState(false);
  const [order, setOrder] = useState({ order_number: "", order_date: new Date().toISOString().slice(0, 10) });
  const { busy, run, feedback } = useAction();
  const editable = me?.active_role === "admin" && t?.status === "draft";

  useEffect(() => { if (t) setSelected(new Map(t.members.map((m) => [m.athlete_id, m.role]))); }, [t]);
  if (!t) return <Loading />;

  const toggle = (aid: number) => {
    const n = new Map(selected);
    if (n.has(aid)) n.delete(aid); else n.set(aid, "main");
    setSelected(n);
  };
  const saveMembers = () => run(async () => {
    const order = rating.data?.rows.map((r) => r.athlete_id).filter((a) => selected.has(a)) ?? [];
    const extra = [...selected.keys()].filter((a) => !order.includes(a));
    team.setData(await api<Team>(`/api/teams/${t.id}/members`, { method: "PUT", json: [...order, ...extra].map((a) => ({ athlete_id: a, role: selected.get(a) })) }));
  }, "Состав сохранён");

  return (
    <>
      <PageHeader title={t.title} back={{ to: "/admin/teams", label: "Сборная" }}
                  lead={t.status === "approved" ? `Утверждена приказом № ${t.order_number} от ${fmtDate(t.order_date)}.` : "Черновик: отметьте спортсменов в рейтинге и сохраните состав."}
                  actions={<>
                    <DownloadButtons items={[
                      { label: "Список .docx", onClick: dl(`/api/teams/${t.id}/list.docx`, `сборная_${t.id}.docx`) },
                      { label: "Список .xlsx", onClick: dl(`/api/teams/${t.id}/list.xlsx`, `сборная_${t.id}.xlsx`) },
                      { label: "Проект приказа .docx", onClick: dl(`/api/teams/${t.id}/order.docx`, `приказ_сборная_${t.id}.docx`) },
                    ]} />
                    {editable && t.members.length > 0 && <button className="btn-primary" onClick={() => setApprove(true)}>Утвердить состав</button>}
                  </>} />
      {feedback}
      <Section title={`Состав (${t.members.length})`}>
        {t.members.length === 0 ? <Empty>Состав пуст. Отметьте спортсменов в рейтинге ниже.</Empty> : (
          <Table head={<><th>№</th><th>Спортсмен</th><th>Разряд</th><th className="text-right">Рейтинг</th><th>Состав</th></>}>
            {t.members.map((m, i) => (
              <tr key={m.athlete_id}>
                <td className="num">{i + 1}</td>
                <td className="font-medium">{m.full_name}<div className="text-xs font-normal text-ink-muted">{m.birth_year} г. р., {m.organization ?? "без организации"}</div></td>
                <td className="text-sm">{m.rank ?? "б/р"}</td>
                <td className="num text-right">{m.rating_points ?? "-"}</td>
                <td>
                  {editable ? (
                    <select aria-label={`Состав: ${m.full_name}`} className="input" value={selected.get(m.athlete_id) ?? m.role}
                            onChange={(e) => setSelected(new Map(selected).set(m.athlete_id, e.target.value as "main" | "reserve"))}>
                      <option value="main">Основной</option>
                      <option value="reserve">Резерв</option>
                    </select>
                  ) : m.role === "main" ? "Основной" : "Резерв"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      {editable && (
        <Section title={`Рейтинг сезона ${t.season}`} actions={<button className="btn-primary" disabled={busy} onClick={saveMembers}>Сохранить состав ({selected.size})</button>}>
          {!rating.data ? <Loading /> : <RatingTable rows={rating.data.rows} selectable selected={new Set(selected.keys())} onToggle={toggle} />}
        </Section>
      )}
      <Dialog open={approve} onClose={() => setApprove(false)} title="Утверждение состава">
        <div className="grid gap-4">
          <Field label="Номер приказа">{(id) => <input id={id} className="input" value={order.order_number} onChange={(e) => setOrder({ ...order, order_number: e.target.value })} />}</Field>
          <Field label="Дата приказа">{(id) => <input id={id} type="date" className="input" value={order.order_date} onChange={(e) => setOrder({ ...order, order_date: e.target.value })} />}</Field>
          <p className="hint">Спортсмены получат уведомление о включении в сборную. После утверждения состав не меняется.</p>
          <button className="btn-primary justify-self-start" disabled={busy || !order.order_number}
                  onClick={() => run(() => api<Team>(`/api/teams/${t.id}/approve`, { method: "POST", json: order }).then((d) => { team.setData(d); setApprove(false); }), "Состав утверждён")}>Утвердить</button>
        </div>
      </Dialog>
    </>
  );
}
