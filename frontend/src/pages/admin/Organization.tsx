import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Empty, Field, Loading, PageHeader, Section, Select, Table, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { fmtDate, ORG_TYPE, STAGE, STAGE_SHORT } from "../../labels";

interface OrgCard {
  id: number; name: string; short_name: string | null; type: string; municipality_id: number; municipality: string;
  conducts_sport_training: boolean; license_number: string | null; license_date: string | null; address: string | null;
  programs: { discipline_id: number; discipline: string; stage: string }[];
  coaches: { id: number; full_name: string }[];
  groups: { id: number; name: string; discipline: string; stage: string; coach: string; members: number }[];
}

export default function Organization() {
  const { id } = useParams();
  const isNew = id === "new";
  const { me } = useAuth();
  const navigate = useNavigate();
  const dicts = useDictionaries();
  const card = useApi<OrgCard>(isNew ? null : `/api/organizations/${id}`);
  const editable = me?.active_role === "admin";
  const [f, setF] = useState({ name: "", short_name: "", type: "school", municipality_id: "", conducts_sport_training: false, license_number: "", license_date: "", address: "" });
  const [programs, setPrograms] = useState<{ discipline_id: number; stage: string }[]>([]);
  const [newProg, setNewProg] = useState({ discipline_id: "", stage: "np" });
  const { busy, run, feedback } = useAction();

  useEffect(() => {
    const c = card.data;
    if (!c) return;
    setF({ name: c.name, short_name: c.short_name ?? "", type: c.type, municipality_id: String(c.municipality_id), conducts_sport_training: c.conducts_sport_training,
           license_number: c.license_number ?? "", license_date: c.license_date ?? "", address: c.address ?? "" });
    setPrograms(c.programs.map((p) => ({ discipline_id: p.discipline_id, stage: p.stage })));
  }, [card.data]);

  if ((!isNew && !card.data) || !dicts) return <Loading />;
  const set = (k: keyof typeof f) => (v: string | boolean) => setF({ ...f, [k]: v });
  const discName = (id: number) => dicts.disciplines.find((d) => d.id === id)?.name ?? "";

  const save = () => run(async () => {
    const body = { ...f, municipality_id: Number(f.municipality_id), short_name: f.short_name || null, license_number: f.license_number || null,
                   license_date: f.license_date || null, address: f.address || null, programs };
    const saved = isNew ? await api<OrgCard>("/api/admin/organizations", { method: "POST", json: body })
                        : await api<OrgCard>(`/api/admin/organizations/${id}`, { method: "PUT", json: body });
    if (isNew) navigate(`/admin/organizations/${saved.id}`); else card.setData(saved);
  }, "Карточка организации сохранена");

  const text = (k: keyof typeof f, label: string, type = "text") => (
    <Field label={label}>{(i) => <input id={i} type={type} className="input" disabled={!editable} value={String(f[k])} onChange={(e) => set(k)(e.target.value)} />}</Field>
  );

  return (
    <>
      <PageHeader title={isNew ? "Новая организация" : card.data!.name} back={{ to: "/admin/registry", label: "Реестр" }}
                  lead={!isNew && `${ORG_TYPE[card.data!.type]}, ${card.data!.municipality}`} />
      {feedback}
      <Section title="Реквизиты">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("name", "Полное наименование")}
          {text("short_name", "Краткое наименование")}
          <Select label="Тип" value={f.type} onChange={set("type")} options={Object.entries(ORG_TYPE)} />
          <Select label="Муниципалитет" value={f.municipality_id} onChange={set("municipality_id")} options={dicts.municipalities.map((m) => [m.id, m.name])} />
          {text("address", "Адрес")}
        </div>
      </Section>
      <Section title="Спортивная подготовка">
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!editable} checked={f.conducts_sport_training} onChange={(e) => set("conducts_sport_training")(e.target.checked)} />
          Организация реализует программы спортивной подготовки
        </label>
        {f.conducts_sport_training && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {text("license_number", "Номер лицензии")}
              {text("license_date", "Дата лицензии", "date")}
            </div>
            <h3 className="mb-2 mt-6 font-sans text-sm font-semibold">Реализуемые программы</h3>
            {programs.length === 0 ? <p className="text-sm text-ink-soft">Программы не указаны.</p> : (
              <ul className="space-y-1 text-sm">
                {programs.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {discName(p.discipline_id)}: {STAGE[p.stage].toLowerCase()}
                    {editable && <button className="btn-quiet btn-sm" onClick={() => setPrograms(programs.filter((_, j) => j !== i))}>убрать</button>}
                  </li>
                ))}
              </ul>
            )}
            {editable && (
              <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Select label="Дисциплина" value={newProg.discipline_id} onChange={(v) => setNewProg({ ...newProg, discipline_id: v })} options={dicts.disciplines.map((d) => [d.id, d.name])} />
                <Select label="Этап" value={newProg.stage} onChange={(v) => setNewProg({ ...newProg, stage: v })} options={Object.entries(STAGE)} />
                <button className="btn-secondary" disabled={!newProg.discipline_id}
                        onClick={() => setPrograms([...programs, { discipline_id: Number(newProg.discipline_id), stage: newProg.stage }])}>Добавить программу</button>
              </div>
            )}
          </>
        )}
      </Section>
      {editable && <button className="btn-primary mb-10" disabled={busy || !f.name || !f.municipality_id} onClick={save}>{isNew ? "Создать организацию" : "Сохранить карточку"}</button>}
      {!isNew && (
        <>
          <Section title="Тренеры-преподаватели">
            {card.data!.coaches.length === 0 ? <Empty>Тренеры не указаны.</Empty> : <ul className="text-sm">{card.data!.coaches.map((c) => <li key={c.id}>{c.full_name}</li>)}</ul>}
          </Section>
          <Section title="Учебно-тренировочные группы">
            {card.data!.groups.length === 0 ? <Empty>Групп нет.</Empty> : (
              <Table head={<><th>Группа</th><th>Этап</th><th>Тренер</th><th>Спортсменов</th></>}>
                {card.data!.groups.map((g) => (
                  <tr key={g.id}>
                    <td><Link to={`/admin/groups/${g.id}`}>{g.name}</Link><div className="text-xs text-ink-muted">{g.discipline}</div></td>
                    <td>{STAGE_SHORT[g.stage]}</td>
                    <td>{g.coach}</td>
                    <td className="num">{g.members}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
          {card.data!.license_date && <p className="text-xs text-ink-muted">Лицензия от {fmtDate(card.data!.license_date)}</p>}
        </>
      )}
    </>
  );
}
