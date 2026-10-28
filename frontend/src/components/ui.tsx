import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import type { Tone } from "../labels";

const ICONS = {
  chevron: "M6 9l6 6 6-6",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  back: "M15 6l-6 6 6 6",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  menu: "M4 6h16M4 12h16M4 18h16",
};

export function Icon({ name, size = 18, className = "" }: { name: keyof typeof ICONS; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function RouteTabs({ tabs }: { tabs: { to: string; label: string }[] }) {
  return (
    <nav aria-label="Подразделы" className="mb-8 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end
                 className={({ isActive }) => `-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${isActive ? "border-fed text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export interface MenuItem { label: string; onClick?: () => void; to?: string; danger?: boolean; hidden?: boolean }

export function RowMenu({ items, label = "Действия" }: { items: MenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const visible = items.filter((i) => !i.hidden);
  useEffect(() => {
    if (!pos) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setPos(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setPos(null); btn.current?.focus(); } };
    const away = () => setPos(null);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [pos]);
  if (visible.length === 0) return null;
  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  return (
    <div className="inline-block text-left" ref={ref}>
      <button ref={btn} className="btn-secondary btn-sm" aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}>
        {label} <Icon name="chevron" size={14} />
      </button>
      {pos && (
        <div role="menu" style={{ top: pos.top, right: pos.right }}
             className="fixed z-50 min-w-56 border-2 border-line bg-white py-1 shadow-[0_8px_24px_-8px_rgba(43,10,92,0.25)]">
          {visible.map((i) => i.to ? (
            <Link key={i.label} role="menuitem" to={i.to} className="block px-4 py-2.5 text-sm font-medium text-ink hover:bg-fed-tint hover:text-ink">{i.label}</Link>
          ) : (
            <button key={i.label} role="menuitem" onClick={() => { setPos(null); i.onClick?.(); }}
                    className={`block w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-fed-tint ${i.danger ? "text-danger" : "text-ink"}`}>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function usePager<T>(items: T[] | null | undefined, size = 20) {
  const [page, setPage] = useState(0);
  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { if (page >= pages) setPage(0); }, [page, pages]);
  const pageItems = items?.slice(page * size, page * size + size) ?? [];
  const pager = pages > 1 ? (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</button>
      <span className="text-ink-soft">{page * size + 1}–{Math.min(total, (page + 1) * size)} из {total}</span>
      <button className="btn-secondary btn-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Дальше</button>
    </div>
  ) : null;
  return { pageItems, pager, reset: () => setPage(0) };
}

const TONES: Record<Tone, string> = {
  slate: "bg-field text-ink-soft ring-line",
  green: "bg-ok/10 text-ok ring-ok/20",
  amber: "bg-signal/10 text-signal ring-signal/25",
  blue: "bg-fed-tint text-fed-dark ring-fed/20",
  rose: "bg-danger/10 text-danger ring-danger/20",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Place({ place, size = "md" }: { place: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-7 min-w-7 text-xs", md: "h-9 min-w-9 text-sm", lg: "h-14 min-w-14 text-xl" }[size];
  const tone =
    place === 1 ? "bg-gold text-white" : place === 2 ? "bg-silver text-white" : place === 3 ? "bg-bronze text-white" : "bg-white text-ink ring-1 ring-inset ring-line";
  return (
    <span className={`num inline-flex items-center justify-center rounded-[4px] px-1.5 font-extrabold ${dims} ${place ? tone : "bg-field text-ink-muted"}`}
          aria-label={place ? `${place} место` : "без места"}>
      {place ?? "-"}
    </span>
  );
}

export function PageHeader({ title, lead, actions, back }: { title: string; lead?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="mb-6">
      {back && <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold"><Icon name="back" size={16} />{back.label}</Link>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="hyphens-auto text-xl font-extrabold leading-tight [overflow-wrap:anywhere] sm:text-2xl lg:text-3xl">{title}</h1>
          {lead && <div className="mt-2 max-w-[68ch] text-base text-ink-muted">{lead}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, actions, children, className = "" }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-12 min-w-0 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="cut-br overflow-x-auto bg-white px-2 pb-3 pt-4 sm:px-5">
      <table className="proto">
        <thead><tr>{head}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Notice({ tone = "rose", children }: { tone?: "rose" | "green" | "amber" | "blue"; children: ReactNode }) {
  if (!children) return null;
  const cls = { rose: "border-transparent bg-[#FBE9EA] text-[#C21D2B]", green: "border-ok/30 bg-ok/5 text-ok", amber: "border-signal/30 bg-signal/5 text-signal", blue: "border-fed/20 bg-fed-tint text-fed-dark" }[tone];
  return <div role={tone === "rose" ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${cls}`}>{children}</div>;
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  return message ? <Notice>{message}</Notice> : null;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="cut-br bg-white px-6 py-10 text-center text-sm text-ink-muted">
      <p>{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="py-12 text-center text-sm text-ink-muted" role="status">Загрузка…</div>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="px-1">
      <div className="num text-2xl font-extrabold leading-none text-plum sm:text-3xl">{value}</div>
      <div className="mt-2 text-sm text-ink-soft">{label}</div>
      {note && <div className="mt-1 text-xs text-ink-muted">{note}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options, placeholder = "Выберите…", required = true, className = "" }: {
  label: string; value: string | number | null | undefined; onChange: (v: string) => void;
  options: [string | number, string][]; placeholder?: string; required?: boolean; className?: string;
}) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <select id={id} className="input" required={required} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled={required}>{placeholder}</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === k ? "border-fed text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="cut-br w-[min(36rem,calc(100vw-2rem))] border-0 p-0 text-ink backdrop:bg-plum/40">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <button className="btn-quiet" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{open && children}</div>
    </dialog>
  );
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await fn();
      if (success) setDone(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const feedback = (
    <>
      <ErrorBox message={error} />
      {done && <Notice tone="green">{done}</Notice>}
    </>
  );
  return { busy, error, run, feedback, setError };
}

export function DownloadButtons({ items }: { items: { label: string; onClick: () => void }[] }) {
  return <>{items.map((i) => <button key={i.label} className="btn-secondary btn-sm" onClick={i.onClick}>{i.label}</button>)}</>;
}

export function Wordmark({ light = false, small = false }: { light?: boolean; small?: boolean }) {
  const main = light ? "text-white" : "text-plum";
  return (
    <span className="inline-flex flex-col leading-none" aria-label="ФСП Оренбуржье">
      <span className="relative inline-flex items-start">
        <span className={`font-extrabold tracking-tight ${main} ${small ? "text-xl" : "text-[3.25rem] leading-none"}`}>ФСП</span>
        <span className={`ml-1 font-extrabold text-transparent ${small ? "-mt-0.5 text-xs" : "-mt-2 text-[1.6rem]"}`}
              style={{ WebkitTextStroke: `${small ? 1.1 : 1.6}px ${light ? "#D9B8FF" : "#7B12D9"}` }}>56</span>
      </span>
      {!small && <span className={`mt-2 text-sm font-semibold ${light ? "text-white/70" : "text-ink-muted"}`}>Федерация спортивного программирования</span>}
    </span>
  );
}
