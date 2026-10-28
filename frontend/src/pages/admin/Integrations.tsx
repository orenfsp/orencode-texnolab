import { useState } from "react";
import { api } from "../../api";
import { Badge, Field, Loading, Notice, PageHeader, Section, Table, useAction } from "../../components/ui";
import { useApi } from "../../hooks";
import { fmtDate } from "../../labels";

interface Tokens { scopes: Record<string, string>; items: { id: number; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked: boolean }[] }
interface Hooks { events: Record<string, string>; items: { id: number; url: string; events: string[]; is_active: boolean; secret: string; deliveries: { event: string; status_code: number | null; error: string | null; at: string }[] }[] }
interface Client { client_id: string; name: string; redirect_uris: string[]; confidential: boolean; created_at: string }

export default function Integrations() {
  return (
    <>
      <PageHeader title="Интеграции и ФСП ID" lead={<>Подключение соревновательных платформ и сайтов партнёров. Описание API для разработчиков - в файле docs/integrations.md и в <a href="/docs" target="_blank" rel="noreferrer">Swagger</a>.</>} />
      <Clients />
      <TokensBlock />
      <HooksBlock />
    </>
  );
}

function Secret({ label, value }: { label: string; value: string }) {
  return (
    <Notice tone="amber">
      {label}: <code className="num select-all break-all font-bold">{value}</code>
      <div className="mt-1">Скопируйте сейчас - повторно значение не показывается.</div>
    </Notice>
  );
}

function Clients() {
  const list = useApi<Client[]>("/api/admin/oauth-clients");
  const discovery = useApi<{ issuer: string }>("/.well-known/openid-configuration");
  const issuer = discovery.data?.issuer ?? "";
  const [f, setF] = useState({ name: "", redirect: "", confidential: false });
  const [created, setCreated] = useState<{ client_id: string; client_secret: string | null } | null>(null);
  const { busy, run, feedback } = useAction();
  return (
    <Section title="Вход через ФСП ID">
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">
        Платформа - поставщик учётных записей OpenID Connect: поток authorization code с PKCE, страница согласия, discovery-документ
        <a href="/.well-known/openid-configuration" target="_blank" rel="noreferrer"> /.well-known/openid-configuration</a> и userinfo
        (ФИО, роли, дисциплины, разряд). Проверить вход можно в <a href={`${issuer}/demo-client/`} target="_blank" rel="noreferrer">тестовом приложении</a>.
      </p>
      {feedback}
      {created && <Secret label={`client_id ${created.client_id}${created.client_secret ? ", секрет" : ""}`} value={created.client_secret ?? created.client_id} />}
      {list.data && (
        <Table head={<><th>Приложение</th><th>client_id</th><th>Адреса возврата</th><th>Тип</th></>}>
          {list.data.map((c) => (
            <tr key={c.client_id}>
              <td className="font-medium">{c.name}<div className="text-xs font-normal text-ink-muted">с {fmtDate(c.created_at)}</div></td>
              <td><code className="text-sm">{c.client_id}</code></td>
              <td className="text-xs">{c.redirect_uris.join(", ")}</td>
              <td className="text-sm">{c.confidential ? "с секретом" : "публичное, PKCE"}</td>
            </tr>
          ))}
        </Table>
      )}
      <form className="mt-4 grid items-end gap-3 lg:grid-cols-[1fr_1fr_auto_auto]"
            onSubmit={(e) => { e.preventDefault(); run(async () => { setCreated(await api("/api/admin/oauth-clients", { method: "POST", json: { name: f.name, redirect_uris: f.redirect.split(/\s+/).filter(Boolean), confidential: f.confidential } })); setF({ name: "", redirect: "", confidential: false }); list.reload(); }); }}>
        <Field label="Название приложения">{(id) => <input id={id} className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Адрес возврата (redirect_uri)">{(id) => <input id={id} className="input" required placeholder="https://partner.example.org/callback" value={f.redirect} onChange={(e) => setF({ ...f, redirect: e.target.value })} />}</Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={f.confidential} onChange={(e) => setF({ ...f, confidential: e.target.checked })} />С секретом</label>
        <button className="btn-primary" disabled={busy}>Зарегистрировать</button>
      </form>
    </Section>
  );
}

function TokensBlock() {
  const list = useApi<Tokens>("/api/admin/api-tokens");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const { busy, run, feedback } = useAction();
  if (!list.data) return <Loading />;
  return (
    <Section title="Токены доступа внешних систем">
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">Токен передаётся в заголовке X-API-Key и даёт только выбранные права. Например, соревновательная платформа с правом импорта результатов присылает итоги - платформа формирует протокол сама.</p>
      {feedback}
      {token && <Secret label="Новый токен" value={token} />}
      <Table head={<><th>Система</th><th>Права</th><th>Последнее обращение</th><th /></>}>
        {list.data.items.map((t) => (
          <tr key={t.id} className={t.revoked ? "opacity-50" : ""}>
            <td className="font-medium">{t.name}<div className="num text-xs font-normal text-ink-muted">{t.prefix}…</div></td>
            <td className="text-xs">{t.scopes.map((s) => list.data!.scopes[s] ?? s).join(", ")}</td>
            <td className="text-sm">{t.last_used_at ? fmtDate(t.last_used_at) : "не использовался"}</td>
            <td className="text-right">{t.revoked ? <Badge>Отозван</Badge> : <button className="btn-quiet btn-sm" disabled={busy} onClick={() => window.confirm("Отозвать токен? Система потеряет доступ.") && run(() => api(`/api/admin/api-tokens/${t.id}`, { method: "DELETE" }).then(list.reload), "Токен отозван")}>Отозвать</button>}</td>
          </tr>
        ))}
      </Table>
      <form className="mt-4 grid gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api<{ token: string }>("/api/admin/api-tokens", { method: "POST", json: { name, scopes } }); setToken(r.token); setName(""); setScopes([]); list.reload(); }); }}>
        <Field label="Название системы" className="max-w-md">{(id) => <input id={id} className="input" required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <fieldset>
          <legend className="label">Права</legend>
          {Object.entries(list.data.scopes).map(([k, v]) => (
            <label key={k} className="mr-6 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={scopes.includes(k)} onChange={(e) => setScopes(e.target.checked ? [...scopes, k] : scopes.filter((s) => s !== k))} />{v}
            </label>
          ))}
        </fieldset>
        <button className="btn-primary justify-self-start" disabled={busy || scopes.length === 0}>Выпустить токен</button>
      </form>
    </Section>
  );
}

function HooksBlock() {
  const list = useApi<Hooks>("/api/admin/webhooks");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const { busy, run, feedback } = useAction();
  if (!list.data) return <Loading />;
  return (
    <Section title="Вебхуки">
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">Платформа отправляет POST на ваш адрес при событиях. Тело подписано HMAC-SHA256 секретом вебхука, подпись - в заголовке X-FSP-Signature.</p>
      {feedback}
      {list.data.items.filter((w) => w.is_active).map((w) => (
        <div key={w.id} className="mb-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="break-all text-sm">{w.url}</code>
            <button className="btn-quiet btn-sm" onClick={() => run(() => api(`/api/admin/webhooks/${w.id}`, { method: "DELETE" }).then(list.reload), "Вебхук отключён")}>Отключить</button>
          </div>
          <div className="mt-1 text-xs text-ink-soft">События: {w.events.map((e) => list.data!.events[e]).join(", ")}. Секрет: <code className="select-all">{w.secret}</code></div>
          {w.deliveries.length > 0 && (
            <ul className="mt-2 text-xs">
              {w.deliveries.map((d, i) => <li key={i}>{fmtDate(d.at)} {d.event}: {d.status_code ? `HTTP ${d.status_code}` : d.error ? `ошибка: ${d.error}` : "в очереди"}</li>)}
            </ul>
          )}
        </div>
      ))}
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => api("/api/admin/webhooks", { method: "POST", json: { url, events } }).then(() => { setUrl(""); setEvents([]); list.reload(); }), "Вебхук добавлен"); }}>
        <Field label="Адрес" className="max-w-xl">{(id) => <input id={id} type="url" className="input" required placeholder="https://partner.example.org/fsp-hook" value={url} onChange={(e) => setUrl(e.target.value)} />}</Field>
        <fieldset>
          <legend className="label">События</legend>
          {Object.entries(list.data.events).map(([k, v]) => (
            <label key={k} className="mr-6 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={events.includes(k)} onChange={(e) => setEvents(e.target.checked ? [...events, k] : events.filter((x) => x !== k))} />{v}</label>
          ))}
        </fieldset>
        <button className="btn-primary justify-self-start" disabled={busy || events.length === 0}>Добавить вебхук</button>
      </form>
    </Section>
  );
}
