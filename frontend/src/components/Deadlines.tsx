import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks";
import { fmtDate, inDays } from "../labels";
import { Dialog, Empty, Loading } from "./ui";

interface Deadline { kind: string; title: string; detail: string; due: string; days_left: number; link: string | null }

export default function Deadlines({ limit }: { limit?: number }) {
  const { data } = useApi<Deadline[]>("/api/me/deadlines");
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty>Ближайших сроков нет.</Empty>;
  const items = limit ? data.slice(0, limit) : data;
  return (
    <ul className="cut-br divide-y divide-line bg-white px-4">
      {items.map((d, i) => {
        const urgent = d.days_left <= 7;
        const body = (
          <div className="flex items-start gap-4 py-3">
            <div className={`num w-16 shrink-0 text-right text-sm font-bold ${urgent ? "text-signal" : "text-ink"}`}>
              {fmtDate(d.due).slice(0, 5)}
              {d.due.slice(0, 4) !== String(new Date().getFullYear()) && <div className="font-sans text-xs font-normal text-ink-muted">{d.due.slice(0, 4)}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{d.title}</div>
              <div className="truncate text-sm text-ink-soft">{d.detail}</div>
            </div>
            <div className={`shrink-0 text-xs ${urgent ? "font-semibold text-signal" : "text-ink-muted"}`}>{inDays(d.days_left)}</div>
          </div>
        );
        return <li key={i}>{d.link ? <Link to={d.link} className="block hover:bg-fed-tint/50">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

export function DeadlineStrip() {
  const { data } = useApi<Deadline[]>("/api/me/deadlines");
  const [open, setOpen] = useState(false);
  if (!data || data.length === 0) return null;
  const next = data[0];
  const urgent = next.days_left <= 7;
  return (
    <div className={`mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border px-4 py-3 text-sm ${urgent ? "border-signal/30 bg-signal/5" : "border-line bg-white"}`}>
      <span className="text-ink-soft">Ближайший срок:</span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{next.title}</span>, {next.detail.toLowerCase()} -{" "}
        <span className={urgent ? "font-semibold text-signal" : ""}>{inDays(next.days_left)} ({fmtDate(next.due)})</span>
      </span>
      {data.length > 1 && <button className="btn-quiet btn-sm" onClick={() => setOpen(true)}>Все сроки ({data.length})</button>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Мои сроки"><Deadlines /></Dialog>
    </div>
  );
}
