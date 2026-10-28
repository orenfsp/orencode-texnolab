import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, type Notification, type Role } from "../api";
import { HOME, useAuth } from "../auth";
import { fmtDate, ROLE_LABEL } from "../labels";
import { NAV, sectionFor } from "../navigation";
import { Icon, Wordmark } from "./ui";

function RoleSwitcher() {
  const { me, switchRole } = useAuth();
  const navigate = useNavigate();
  if (!me || me.roles.length < 2) return null;
  return (
    <div className="px-3">
      <label htmlFor="role-switch" className="mb-1 block text-xs text-white/60">Кабинет</label>
      <select id="role-switch" className="w-full rounded-control border border-white/15 bg-white/10 px-2 py-2 text-sm text-white"
              value={me.active_role}
              onChange={async (e) => { const m = await switchRole(e.target.value as Role); navigate(HOME[m.active_role]); }}>
        {me.roles.map((r) => <option key={r} value={r} className="text-ink">{ROLE_LABEL[r]}</option>)}
      </select>
    </div>
  );
}

function Bell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const load = () => api<Notification[]>("/api/notifications").then(setItems).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => { clearInterval(t); document.removeEventListener("click", close); };
  }, []);

  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="relative" ref={ref}>
      <button className="relative rounded-control p-2 text-ink hover:bg-white" onClick={() => { setOpen(!open); load(); }}
              aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"} aria-expanded={open}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-fed px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden border-2 border-line bg-white shadow-[0_12px_32px_-12px_rgba(43,10,92,0.3)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Уведомления</span>
            {unread > 0 && <button className="btn-quiet btn-sm" onClick={() => api("/api/notifications/read-all", { method: "POST" }).then(load)}>Отметить прочитанными</button>}
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {items.length === 0 && <div className="p-4 text-sm text-ink-muted">Новых событий нет.</div>}
            {items.map((n) => (
              <Link key={n.id} to={n.link ?? "#"}
                    onClick={() => { setOpen(false); if (!n.read_at) api(`/api/notifications/${n.id}/read`, { method: "POST" }).then(load); }}
                    className="block border-b border-line px-4 py-3 text-ink hover:bg-fed-tint hover:text-ink">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-fed" aria-label="не прочитано" />}{n.title}
                </div>
                <div className="text-sm text-ink-soft">{n.body}</div>
                <div className="mt-1 text-xs text-ink-muted">{fmtDate(n.created_at)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, logout } = useAuth();
  const { pathname } = useLocation();
  if (!me) return null;
  const current = sectionFor(me.active_role, pathname);
  return (
    <div className="flex h-full flex-col bg-plum py-6 text-white">
      <Link to={HOME[me.active_role]} onClick={onNavigate} className="mb-8 px-5 text-white hover:text-white">
        <Wordmark light small />
        <div className="mt-1 text-xs font-medium text-white/60">Оренбургская область</div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3" aria-label="Разделы">
        <ul className="space-y-0.5">
          {NAV[me.active_role].map((n) => {
            const active = current?.to === n.to;
            return (
              <li key={n.to}>
                <Link to={n.to} onClick={onNavigate} aria-current={active ? "page" : undefined}
                      className={`block px-3 py-2.5 text-[15px] font-semibold ${active ? "cut-tr bg-white text-plum hover:text-plum" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 border-t border-white/10 pt-4">
          <NavLink to="/guide" onClick={onNavigate} className="block rounded-control px-3 py-2 text-sm text-white/60 hover:text-white">Справочник понятий</NavLink>
        </div>
      </nav>
      <RoleSwitcher />
      <div className="mt-4 border-t border-white/10 px-5 pt-4 text-sm">
        <Link to="/profile" onClick={onNavigate} className="font-medium text-white hover:text-white hover:underline">{me.full_name}</Link>
        <div className="text-white/60">{ROLE_LABEL[me.active_role]}</div>
        <button onClick={logout} className="mt-2 text-white/70 underline-offset-2 hover:text-white hover:underline">Выйти</button>
      </div>
    </div>
  );
}

export default function Layout() {
  const { me } = useAuth();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);

  if (!me) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Link to="/start" className="text-plum hover:text-plum"><Wordmark small /></Link>
            <nav className="ml-auto flex items-center gap-4 text-sm">
              <Link to="/start">Новичку</Link>
              <Link to="/guide">Справочник</Link>
              <Link to="/login" className="btn-primary btn-sm text-white hover:text-white">Войти</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8"><Outlet /></main>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block"><Sidebar /></aside>
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]"><Sidebar onNavigate={() => setMenu(false)} /></div>
        </div>
      )}
      <div className="min-w-0">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-field/95 px-4 py-2 backdrop-blur">
          <button className="rounded-control p-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Открыть меню">
            <Icon name="menu" size={22} />
          </button>
          <span className="lg:hidden"><Wordmark small /></span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-ink-soft sm:inline">{ROLE_LABEL[me.active_role]}</span>
            <Bell />
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10"><Outlet /></main>
      </div>
    </div>
  );
}
