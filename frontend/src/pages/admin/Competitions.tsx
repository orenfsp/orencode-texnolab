import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Competition } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Dialog, Empty, ErrorBox, Field, Loading, PageHeader, Select, Table } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { COMPETITION_STATUS, fmtRange, FORMAT, LEVEL } from "../../labels";

export default function AdminCompetitions() {
  const { me } = useAuth();
  const [discipline, setDiscipline] = useState("");
  const [status, setStatus] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const dicts = useDictionaries();
  const params = new URLSearchParams(Object.entries({ discipline_id: discipline, status, year }).filter(([, v]) => v));
  const { data, error } = useApi<Competition[]>(`/api/competitions?${params}`);
  const [creating, setCreating] = useState(false);
  const isAdmin = me?.active_role === "admin";
  const y = new Date().getFullYear();

  return (
    <>
      <PageHeader title="Календарь соревнований" lead="Все дисциплины вида спорта. Черновики видны только федерации и министерству."
                  actions={isAdmin && <button className="btn-primary" onClick={() => setCreating(true)}>Новое соревнование</button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Select label="Дисциплина" value={discipline} onChange={setDiscipline} required={false} placeholder="Все дисциплины" options={dicts?.disciplines.map((d) => [d.id, d.name]) ?? []} />
        <Select label="Статус" value={status} onChange={setStatus} required={false} placeholder="Любой" options={Object.entries(COMPETITION_STATUS).map(([k, v]) => [k, v.label])} />
        <Select label="Год" value={year} onChange={setYear} required={false} placeholder="Все годы" options={[y + 1, y, y - 1, y - 2].map((v) => [v, String(v)])} />
      </div>
      <ErrorBox message={error} />
      {!data ? <Loading /> : data.length === 0 ? <Empty>Соревнований по фильтрам нет.</Empty> : (
        <Table head={<><th>Даты</th><th>Соревнование</th><th>Статус</th><th>Заявок</th></>}>
          {data.map((c) => (
            <tr key={c.id}>
              <td className="num whitespace-nowrap text-sm">{fmtRange(c.start_date, c.end_date)}</td>
              <td>
                <Link to={`/admin/competitions/${c.id}`} className="font-medium text-ink hover:text-fed">{c.title}</Link>
                <div className="text-xs text-ink-soft">{c.discipline.name}; {LEVEL[c.level].toLowerCase()}, {FORMAT[c.format].toLowerCase()}; {c.age_group.name.toLowerCase()}</div>
              </td>
              <td><Badge tone={COMPETITION_STATUS[c.status].tone}>{COMPETITION_STATUS[c.status].label}</Badge></td>
              <td className="num">{c.applications_count}</td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Новое соревнование"><CompetitionForm /></Dialog>
    </>
  );
}

const EMPTY = {
  title: "", discipline_id: "", type_id: "", level: "regional", age_group_id: "", format: "offline",
  format_details: "", venue: "", start_date: "", end_date: "", registration_deadline: "",
  calendar_plan: "regional", calendar_plan_number: "", rating_level: "",
};

export function CompetitionForm({ initial, onSaved }: { initial?: Competition; onSaved?: (c: Competition) => void }) {
  const dicts = useDictionaries();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(initial ? {
    title: initial.title, discipline_id: String(initial.discipline.id), type_id: String(initial.type.id), level: initial.level,
    age_group_id: String(initial.age_group.id), format: initial.format, format_details: initial.format_details ?? "", venue: initial.venue ?? "",
    start_date: initial.start_date, end_date: initial.end_date, registration_deadline: initial.registration_deadline ?? "",
    calendar_plan: initial.calendar_plan, calendar_plan_number: initial.calendar_plan_number ?? "", rating_level: initial.rating_level,
  } : EMPTY);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const body = {
        ...f, discipline_id: Number(f.discipline_id), type_id: Number(f.type_id), age_group_id: Number(f.age_group_id),
        end_date: f.end_date || f.start_date, registration_deadline: f.registration_deadline || null,
        calendar_plan_number: f.calendar_plan === "none" ? null : f.calendar_plan_number || null,
        format_details: f.format_details || null, venue: f.venue || null, rating_level: f.rating_level || null,
      };
      const c = initial
        ? await api<Competition>(`/api/competitions/${initial.id}`, { method: "PUT", json: body })
        : await api<Competition>("/api/competitions", { method: "POST", json: body });
      if (onSaved) onSaved(c); else navigate(`/admin/competitions/${c.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!dicts) return <Loading />;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Наименование" className="sm:col-span-2">{(id) => <input id={id} className="input" required value={f.title} onChange={(e) => set("title")(e.target.value)} placeholder="Первенство Оренбургской области по …" />}</Field>
      <Select label="Дисциплина" value={f.discipline_id} onChange={set("discipline_id")} options={dicts.disciplines.map((d) => [d.id, d.name])} />
      <Select label="Тип" value={f.type_id} onChange={set("type_id")} options={dicts.competition_types.map((d) => [d.id, d.name])} />
      <Select label="Возрастная группа" value={f.age_group_id} onChange={set("age_group_id")} options={dicts.age_groups.map((d) => [d.id, d.name])} />
      <Select label="Статус соревнования" value={f.level} onChange={set("level")} options={Object.entries(LEVEL)} />
      <Select label="Уровень для рейтинга" value={f.rating_level} onChange={set("rating_level")} required={false} placeholder="Определить автоматически"
              options={[["rus_championship", "Чемпионат России"], ["rus_youth", "Первенство России"], ["interregional", "Межрегиональные"], ["regional", "Региональные"], ["none", "Не учитывать"]]} />
      <Select label="Формат" value={f.format} onChange={set("format")} options={Object.entries(FORMAT)} />
      {f.format === "mixed" && (
        <Field label="Что проходит онлайн, а что очно" className="sm:col-span-2">{(id) => <input id={id} className="input" value={f.format_details} onChange={(e) => set("format_details")(e.target.value)} placeholder="Разработка онлайн, защита проектов очно" />}</Field>
      )}
      <Field label="Место проведения" className="sm:col-span-2">{(id) => <input id={id} className="input" value={f.venue} onChange={(e) => set("venue")(e.target.value)} />}</Field>
      <Field label="Дата начала">{(id) => <input id={id} type="date" className="input" required value={f.start_date} onChange={(e) => set("start_date")(e.target.value)} />}</Field>
      <Field label="Дата окончания">{(id) => <input id={id} type="date" className="input" value={f.end_date} onChange={(e) => set("end_date")(e.target.value)} />}</Field>
      <Field label="Приём заявок до">{(id) => <input id={id} type="date" className="input" value={f.registration_deadline} onChange={(e) => set("registration_deadline")(e.target.value)} />}</Field>
      <Select label="Календарный план" value={f.calendar_plan} onChange={set("calendar_plan")} options={[["none", "Не включено"], ["regional", "План Оренбургской области"], ["ekp", "ЕКП Минспорта России"]]} />
      {f.calendar_plan !== "none" && (
        <Field label="Номер в календарном плане">{(id) => <input id={id} className="input" required value={f.calendar_plan_number} onChange={(e) => set("calendar_plan_number")(e.target.value)} />}</Field>
      )}
      <div className="sm:col-span-2">
        <ErrorBox message={error} />
        <button className="btn-primary">{initial ? "Сохранить изменения" : "Создать черновик"}</button>
      </div>
    </form>
  );
}
