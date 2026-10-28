import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import { Badge, Empty, Field, Loading, PageHeader, Select, Table, Tabs, usePager } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { fmtDate, ORG_TYPE, STAGE, STAGE_SHORT } from "../../labels";

type Tab = "athletes" | "coaches" | "judges" | "organizations";

interface Athlete { id: number; full_name: string; birth_date: string | null; age: number | null; municipality: string | null; organization: string | null; disciplines: string[]; start_year: number; training_stage: string | null; rank: string | null; rank_valid_until: string | null; coaches: string[] }
interface Coach { id: number; full_name: string; organization: string | null; municipality: string | null; athletes: number; disciplines: string[]; also_judge: boolean }
interface Judge { id: number; full_name: string; municipality: string | null; category: string | null; valid_until: string | null; days_left: number | null; competitions: number }
interface Org { id: number; name: string; short_name: string | null; type: string; municipality: string; conducts_sport_training: boolean; license_number: string | null; athletes: number; coaches: number }

export default function Registry() {
  const [tab, setTab] = useState<Tab>("athletes");
  return (
    <>
      <PageHeader title="Реестр" lead="Спортсмены, тренеры, судьи и организации по всем дисциплинам вида спорта." />
      <Tabs tabs={[["athletes", "Спортсмены"], ["coaches", "Тренеры"], ["judges", "Судьи"], ["organizations", "Организации"]]} value={tab} onChange={setTab} />
      {tab === "athletes" && <Athletes />}
      {tab === "coaches" && <Coaches />}
      {tab === "judges" && <Judges />}
      {tab === "organizations" && <Orgs />}
    </>
  );
}

function Athletes() {
  const dicts = useDictionaries();
  const [f, setF] = useState({ q: "", discipline_id: "", organization_id: "", municipality_id: "", age_group_id: "", min_rank_id: "", training_stage: "" });
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const { data } = useApi<Athlete[]>(`/api/admin/registry/athletes?${params}`);
  const { pageItems, pager } = usePager(data, 20);
  const [more, setMore] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const opt = (items?: { id: number; name: string }[]) => items?.map((d) => [d.id, d.name] as [number, string]) ?? [];

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Поиск">{(id) => <input id={id} className="input" placeholder="ФИО или email" value={f.q} onChange={(e) => set("q")(e.target.value)} />}</Field>
        <Select label="Дисциплина" value={f.discipline_id} onChange={set("discipline_id")} required={false} placeholder="Все" options={opt(dicts?.disciplines)} />
        <Select label="Организация" value={f.organization_id} onChange={set("organization_id")} required={false} placeholder="Все" options={opt(dicts?.organizations)} />
        {more ? (
          <>
            <Select label="Муниципалитет" value={f.municipality_id} onChange={set("municipality_id")} required={false} placeholder="Все" options={opt(dicts?.municipalities)} />
            <Select label="Возрастная группа" value={f.age_group_id} onChange={set("age_group_id")} required={false} placeholder="Все" options={opt(dicts?.age_groups)} />
            <Select label="Разряд не ниже" value={f.min_rank_id} onChange={set("min_rank_id")} required={false} placeholder="Любой" options={opt(dicts?.sport_ranks)} />
            <Select label="Этап подготовки" value={f.training_stage} onChange={set("training_stage")} required={false} placeholder="Любой" options={Object.entries(STAGE)} />
          </>
        ) : (
          <button className="btn-quiet self-end justify-self-start" onClick={() => setMore(true)} title="Муниципалитет, возрастная группа, разряд, этап подготовки">Ещё фильтры</button>
        )}
      </div>
      {!data ? <Loading /> : data.length === 0 ? <Empty>По фильтрам никого нет. Сбросьте часть фильтров.</Empty> : (
        <>
          <p className="mb-3 text-sm text-ink-soft">Найдено: {data.length}</p>
          <Table head={<><th>Спортсмен</th><th>Организация</th><th>Дисциплины</th><th>Разряд</th><th>Этап</th></>}>
            {pageItems.map((a) => (
              <tr key={a.id}>
                <td><span className="font-medium">{a.full_name}</span><div className="text-sm text-ink-muted">{a.age} лет, {a.municipality}</div></td>
                <td>{a.organization}</td>
                <td>{a.disciplines.map((d) => d.replace("Программирование ", "")).join(", ")}</td>
                <td>{a.rank ?? "-"}</td>
                <td>{a.training_stage ? <span title={STAGE[a.training_stage]}>{STAGE_SHORT[a.training_stage]}</span> : "-"}</td>
              </tr>
            ))}
          </Table>
          {pager}
        </>
      )}
    </>
  );
}

function Coaches() {
  const { data } = useApi<Coach[]>("/api/admin/registry/coaches");
  if (!data) return <Loading />;
  return (
    <Table head={<><th>Тренер</th><th>Организация</th><th>Спортсменов</th><th>Дисциплины</th></>}>
      {data.map((c) => (
        <tr key={c.id}>
          <td className="font-medium">{c.full_name}{c.also_judge && <span className="ml-2"><Badge>также судья</Badge></span>}<div className="text-xs font-normal text-ink-muted">{c.municipality}</div></td>
          <td>{c.organization ?? "-"}</td>
          <td className="num">{c.athletes}</td>
          <td className="text-xs">{c.disciplines.join(", ") || "-"}</td>
        </tr>
      ))}
    </Table>
  );
}

function Judges() {
  const { data } = useApi<Judge[]>("/api/admin/registry/judges");
  if (!data) return <Loading />;
  return (
    <>
      <p className="mb-4 text-sm text-ink-soft">Присвоение категорий и заявки судей - в разделе <Link to="/admin/judges">«Судьи и категории»</Link>.</p>
      <Table head={<><th>Судья</th><th>Категория</th><th>Действует до</th><th>Соревнований</th></>}>
        {data.map((j) => (
          <tr key={j.id}>
            <td className="font-medium">{j.full_name}<div className="text-xs font-normal text-ink-muted">{j.municipality}</div></td>
            <td className="text-sm">{j.category ?? "-"}</td>
            <td className={j.days_left !== null && j.days_left <= 60 ? "font-semibold text-signal" : ""}>{fmtDate(j.valid_until)}</td>
            <td className="num">{j.competitions}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Orgs() {
  const { me } = useAuth();
  const { data } = useApi<Org[]>("/api/admin/registry/organizations");
  if (!data) return <Loading />;
  return (
    <>
      {me?.active_role === "admin" && <div className="mb-4"><Link to="/admin/organizations/new" className="btn-primary text-white hover:text-white">Добавить организацию</Link></div>}
      <Table head={<><th>Организация</th><th>Тип</th><th>Спортивная подготовка</th><th>Спортсменов</th><th>Тренеров</th></>}>
        {data.map((o) => (
          <tr key={o.id}>
            <td><Link to={`/admin/organizations/${o.id}`} className="font-medium">{o.name}</Link><div className="text-xs text-ink-muted">{o.municipality}</div></td>
            <td className="text-sm">{ORG_TYPE[o.type]}</td>
            <td className="text-sm">{o.conducts_sport_training ? `лицензия ${o.license_number}` : "-"}</td>
            <td className="num">{o.athletes}</td>
            <td className="num">{o.coaches}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
