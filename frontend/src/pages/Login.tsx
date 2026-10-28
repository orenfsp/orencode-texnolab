import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { HOME, useAuth } from "../auth";
import { Field, Notice, Place, Wordmark } from "../components/ui";
import { useApi } from "../hooks";
import { fmtDate } from "../labels";

const DEMO = [
  { email: "admin@fsp56.demo", label: "Федерация" },
  { email: "athlete@fsp56.demo", label: "Спортсмен" },
  { email: "coach@fsp56.demo", label: "Тренер и судья" },
  { email: "student@fsp56.demo", label: "Спортсмен и тренер" },
  { email: "judge@fsp56.demo", label: "Судья" },
  { email: "ministry@fsp56.demo", label: "Министерство" },
];

interface Overview {
  podiums: { competition_id: number; title: string; date: string; top: { place: number; name: string }[] }[];
}

function Podiums() {
  const { data } = useApi<Overview>("/api/public/overview");
  if (!data || data.podiums.length === 0) return null;
  return (
    <section className="mx-auto mt-10 w-full max-w-[29.5rem]" aria-labelledby="podiums">
      <h2 id="podiums" className="text-base font-extrabold">Последние призёры</h2>
      <ul className="mt-3 space-y-4">
        {data.podiums.map((p) => (
          <li key={p.competition_id}>
            <Link to={`/protocols/${p.competition_id}`} className="text-sm font-semibold text-ink hover:text-fed">{p.title}</Link>
            <span className="ml-2 text-xs text-ink-muted">{fmtDate(p.date)}</span>
            <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {p.top.map((t) => (
                <li key={t.place} className="flex items-center gap-2 text-sm"><Place place={t.place} size="sm" />{t.name}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Login() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to={next ?? HOME[me.active_role]} replace />;

  const submit = async (e: FormEvent, creds?: { email: string; password: string }) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const m = await login(creds?.email ?? email, creds?.password ?? password);
      navigate(next ?? HOME[m.active_role]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-field px-4 py-12 sm:py-20">
      <div className="panel mx-auto w-full max-w-[29.5rem] sm:px-12 sm:py-12">
        <div className="flex justify-center"><Wordmark /></div>
        <h1 className="mt-10 text-2xl font-extrabold">Вход в личный кабинет</h1>
        <p className="mt-2 text-[0.9375rem] text-ink-muted">
          Один аккаунт для всех ролей: спортсмена, тренера и судьи. Кабинет переключается без повторного входа.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="Email">{(id) => <input id={id} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />}</Field>
          <Field label="Пароль">{(id) => <input id={id} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />}</Field>
          {error && <Notice>{error}</Notice>}
          <button className="btn-primary w-full py-3.5 text-base" disabled={busy}>Войти</button>
        </form>
        <div className="mt-6 border-t border-line pt-5 text-center text-sm">
          <Link to="/register" className="font-semibold">Зарегистрироваться как спортсмен</Link>
          <p className="mt-2 text-ink-muted">Впервые здесь? <Link to="/start" className="text-ink-muted underline hover:text-fed">Как начать заниматься</Link></p>
        </div>
        <div className="mt-8">
          <p className="text-sm font-semibold text-ink-muted">Демо: вход одним нажатием, пароль demo1234</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button key={d.email} className="btn-secondary btn-sm justify-start py-2" disabled={busy}
                      onClick={(e) => submit(e, { email: d.email, password: "demo1234" })}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Podiums />
      <p className="mx-auto mt-10 max-w-[29.5rem] text-center text-xs text-ink-muted">Демонстрационная версия. Все персональные данные вымышлены.</p>
    </main>
  );
}
