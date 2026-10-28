import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Icon, Loading, Notice, useAction, Wordmark } from "../../components/ui";
import { useApi } from "../../hooks";

interface ClientInfo { name: string; scopes: { scope: string; title: string }[] }

export default function Consent() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { me, loading } = useAuth();
  const q = Object.fromEntries(params);
  const info = useApi<ClientInfo>(`/api/oauth/client-info?${new URLSearchParams({ client_id: q.client_id ?? "", redirect_uri: q.redirect_uri ?? "", scope: q.scope ?? "openid" })}`);
  const { busy, run, feedback } = useAction();

  if (loading) return <Loading />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (info.error) return <Notice>{info.error}</Notice>;
  if (!info.data) return <Loading />;

  const answer = (allow: boolean) => run(async () => {
    const r = await api<{ redirect_to: string }>("/api/oauth/authorize", { method: "POST", json: { ...q, allow } });
    window.location.href = r.redirect_to;
  });

  return (
    <div className="panel mx-auto max-w-[29.5rem] sm:px-12">
      <div className="flex justify-center"><Wordmark /></div>
      <h1 className="mt-10 text-2xl font-extrabold">Вход через ФСП ID</h1>
      <p className="mt-3 text-ink-soft">
        Приложение <strong className="text-ink">{info.data.name}</strong> просит доступ к данным вашего аккаунта {me.full_name}.
      </p>
      <ul className="mt-6 space-y-2 border-y border-line py-4 text-sm">
        {info.data.scopes.map((s) => <li key={s.scope} className="flex gap-2"><Icon name="check" size={18} className="shrink-0 text-ok" />{s.title}</li>)}
      </ul>
      <p className="mt-4 text-sm text-ink-muted">Пароль приложению не передаётся. Согласие можно отозвать в федерации.</p>
      {feedback}
      <div className="mt-6 flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={() => answer(true)}>Разрешить и войти</button>
        <button className="btn-secondary" disabled={busy} onClick={() => answer(false)}>Отказать</button>
      </div>
    </div>
  );
}
