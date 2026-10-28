import { useState } from "react";
import { dl } from "../../api";
import { Loading, PageHeader, Section, Table, Tabs } from "../../components/ui";
import { useApi } from "../../hooks";

interface Headcount {
  years: number[];
  total: Record<string, number>;
  slices: Record<string, { name: string; values: Record<string, number> }[]>;
}

const SLICES: [string, string][] = [
  ["organization", "Организации"], ["discipline", "Дисциплины"], ["age_group", "Возрастные группы"],
  ["municipality", "Муниципалитеты"], ["stage", "Этапы подготовки"],
];

const pct = (a: number, b: number) => (a ? Math.round(((b - a) / a) * 1000) / 10 : null);

function YearColumns({ years, values }: { years: number[]; values: Record<string, number> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...years.map((y) => values[y] ?? 0), 1);
  const H = 160, band = 72, bar = 24, top = 24;
  const W = band * years.length;
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H + 28}`} width={W} height={H + 28} role="img"
           aria-label={`Численность по годам: ${years.map((y) => `${y} - ${values[y]}`).join(", ")}`}>
        <line x1={0} x2={W} y1={H} y2={H} stroke="#D9DEE7" strokeWidth={1} />
        {years.map((y, i) => {
          const v = values[y] ?? 0;
          const h = Math.max(2, ((H - top) * v) / max);
          const x = i * band + (band - bar) / 2;
          const r = 4;
          const d = `M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + bar - r} Q${x + bar},${H - h} ${x + bar},${H - h + r} V${H} Z`;
          return (
            <g key={y} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * band} y={0} width={band} height={H + 28} fill="transparent" />
              <path d={d} fill="#2453FF" opacity={hover === null || hover === i ? 1 : 0.55} />
              <text x={x + bar / 2} y={H - h - 8} textAnchor="middle" className="fill-ink font-display text-[13px] font-bold">{v}</text>
              <text x={x + bar / 2} y={H + 20} textAnchor="middle" className="fill-ink-soft text-[12px]">{y}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && hover > 0 && (
        <div className="pointer-events-none absolute left-0 top-0 rounded-control border border-line bg-white px-3 py-2 text-xs shadow-lg"
             style={{ transform: `translateX(${hover * band + band}px)` }}>
          <div className="font-semibold">{years[hover]}: {values[years[hover]]}</div>
          <div className="text-ink-soft">к {years[hover - 1]}: {(() => { const p = pct(values[years[hover - 1]], values[years[hover]]); return p === null ? "-" : `${p > 0 ? "+" : ""}${p}%`; })()}</div>
        </div>
      )}
    </figure>
  );
}

export default function Reports() {
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(y - 2);
  const years = Array.from({ length: y - from + 1 }, (_, i) => from + i);
  const q = years.map((v) => `years=${v}`).join("&");
  const { data } = useApi<Headcount>(`/api/reports/headcount?${q}`);
  const [slice, setSlice] = useState("organization");

  return (
    <>
      <PageHeader title="Численность занимающихся" lead="Отчёт «Численность занимающихся спортивным программированием в Оренбургской области» по годам."
                  actions={<button className="btn-primary" onClick={dl(`/api/reports/headcount.xlsx?${q}`, `численность_${from}-${y}.xlsx`)}>Выгрузить .xlsx</button>} />
      <div className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">Период:</span>
        {[2, 3, 4].map((n) => (
          <button key={n} className={from === y - n ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setFrom(y - n)}>{y - n}–{y}</button>
        ))}
      </div>
      {!data ? <Loading /> : (
        <>
          <Section title="Всего занимающихся">
            <div className="flex flex-wrap items-end gap-10">
              <YearColumns years={data.years} values={data.total} />
              <p className="max-w-sm text-sm text-ink-soft">
                За {data.years[0]}–{data.years[data.years.length - 1]} годы численность изменилась
                {" "}<strong className="text-ink">{(() => { const p = pct(data.total[data.years[0]], data.total[data.years[data.years.length - 1]]); return p === null ? "-" : `${p > 0 ? "+" : ""}${p}%`; })()}</strong>.
                Учитываются спортсмены реестра по году начала занятий; прекратившие занятия выбывают из следующих лет.
              </p>
            </div>
          </Section>
          <Section title="Разрезы">
            <Tabs tabs={SLICES as [string, string][]} value={slice} onChange={setSlice} />
            <Table head={<><th>{SLICES.find(([k]) => k === slice)?.[1]}</th>{data.years.map((yy) => <th key={yy} className="text-right">{yy}</th>)}<th className="text-right">Изменение</th></>}>
              {data.slices[slice].length === 0 && <tr><td colSpan={data.years.length + 2} className="text-ink-soft">Нет данных: спортсмены не зачислены в группы спортивной подготовки.</td></tr>}
              {data.slices[slice].map((r) => {
                const p = pct(r.values[data.years[0]], r.values[data.years[data.years.length - 1]]);
                return (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    {data.years.map((yy) => <td key={yy} className="num text-right">{r.values[yy]}</td>)}
                    <td className={`num text-right ${p !== null && p < 0 ? "text-danger" : ""}`}>{p === null ? "новые" : `${p > 0 ? "+" : ""}${p}%`}</td>
                  </tr>
                );
              })}
            </Table>
            {slice === "discipline" && <p className="hint mt-2">Спортсмен с несколькими дисциплинами учитывается в каждой из них.</p>}
          </Section>
        </>
      )}
    </>
  );
}
