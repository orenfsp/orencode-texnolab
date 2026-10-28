import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { download, postForm } from "../../api";
import { useAuth } from "../../auth";
import { Field, Loading, PageHeader, Section, Stat, Table, useAction } from "../../components/ui";
import { useApi } from "../../hooks";
import { fmtDate } from "../../labels";

interface Doc { id: number; title: string; filename: string }
interface Indicators {
  year: number;
  headcount: { source: string; years: number[]; total: Record<string, number>; change_pct: number | null; documents: Doc[] };
  organizations: { source: string; items: { id: number; name: string; municipality: string; license: string | null; programs: string[] }[]; documents: Doc[] };
  competitions: { source: string; items: { id: number; title: string; date: string; level: string; plan: string; plan_number: string | null; participants: number }[]; in_plans: number; documents: Doc[] };
}

export default function Indicators() {
  const { me } = useAuth();
  const y = new Date().getFullYear();
  const [year, setYear] = useState(y);
  const { data, reload } = useApi<Indicators>(`/api/indicators?year=${year}`);
  if (!data) return <Loading />;
  const hc = data.headcount;
  const canUpload = me?.active_role === "admin";
  return (
    <>
      <PageHeader title="Развитие вида спорта" lead="Сводка для отчётности: у каждого показателя указан источник в платформе и можно приложить подтверждающие документы." />
      <div className="mb-8 flex gap-2">{[y, y - 1, y - 2].map((v) => <button key={v} className={v === year ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setYear(v)}>{v}</button>)}</div>

      <Section title="Численность занимающихся">
        <div className="cut-br mb-4 grid grid-cols-2 gap-8 bg-white px-6 py-6 sm:grid-cols-4">
          {hc.years.map((yy) => <Stat key={yy} label={`${yy} год`} value={hc.total[yy]} />)}
          <Stat label={`изменение за ${hc.years[0]}–${hc.years[hc.years.length - 1]}`} value={hc.change_pct === null ? "-" : `${hc.change_pct > 0 ? "+" : ""}${hc.change_pct}%`} />
        </div>
        <Source text={hc.source} link={<Link to="/admin/reports">Подробный отчёт с разрезами</Link>} />
        <Docs indicator="headcount" year={year} docs={hc.documents} canUpload={canUpload} onChange={reload} />
      </Section>

      <Section title={`Организации, ведущие спортивную подготовку (${data.organizations.items.length})`}>
        <Table head={<><th>Организация</th><th>Лицензия</th><th>Программы</th></>}>
          {data.organizations.items.map((o) => (
            <tr key={o.id}>
              <td><Link to={`/admin/organizations/${o.id}`}>{o.name}</Link><div className="text-xs text-ink-muted">{o.municipality}</div></td>
              <td className="text-sm">{o.license ?? "-"}</td>
              <td className="text-xs">{o.programs.join(", ")}</td>
            </tr>
          ))}
        </Table>
        <Source text={data.organizations.source} />
        <Docs indicator="organizations" year={year} docs={data.organizations.documents} canUpload={canUpload} onChange={reload} />
      </Section>

      <Section title={`Официальные соревнования ${year} года (${data.competitions.items.length})`}>
        <p className="mb-3 text-sm text-ink-soft">Включены в календарные планы: {data.competitions.in_plans} из {data.competitions.items.length}.</p>
        <Table head={<><th>Дата</th><th>Соревнование</th><th>Статус</th><th>Календарный план</th><th>Участников</th></>}>
          {data.competitions.items.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap">{fmtDate(c.date)}</td>
              <td><Link to={`/protocols/${c.id}`}>{c.title}</Link></td>
              <td className="text-sm">{c.level}</td>
              <td className="text-sm">{c.plan}{c.plan_number && `, № ${c.plan_number}`}</td>
              <td className="num">{c.participants}</td>
            </tr>
          ))}
        </Table>
        <Source text={data.competitions.source} />
        <Docs indicator="competitions" year={year} docs={data.competitions.documents} canUpload={canUpload} onChange={reload} />
      </Section>
    </>
  );
}

function Source({ text, link }: { text: string; link?: React.ReactNode }) {
  return <p className="mt-3 text-xs text-ink-muted">Источник: {text.charAt(0).toLowerCase() + text.slice(1)}. {link}</p>;
}

function Docs({ indicator, year, docs, canUpload, onChange }: { indicator: string; year: number; docs: Doc[]; canUpload: boolean; onChange: () => void }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { busy, run, feedback } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("indicator", indicator);
    fd.append("year", String(year));
    fd.append("title", title);
    fd.append("file", file!);
    run(() => postForm("/api/indicators/documents", fd).then(() => { setTitle(""); setFile(null); onChange(); }), "Документ прикреплён");
  };
  return (
    <div className="mt-4">
      {docs.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {docs.map((d) => <li key={d.id}><button className="btn-quiet btn-sm" onClick={() => download(`/api/indicators/documents/${d.id}`, d.filename)}>{d.title}</button></li>)}
        </ul>
      )}
      {canUpload && (
        <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          {feedback}
          <Field label="Подтверждающий документ">{(id) => <input id={id} className="input" placeholder="Например: справка министерства" value={title} onChange={(e) => setTitle(e.target.value)} required />}</Field>
          <Field label="Файл">{(id) => <input id={id} type="file" className="text-sm" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}</Field>
          <button className="btn-secondary" disabled={busy || !file}>Прикрепить</button>
        </form>
      )}
    </div>
  );
}
