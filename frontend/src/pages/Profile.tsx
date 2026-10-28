import { useEffect, useState } from "react";
import { api, dl } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, Field, Loading, PageHeader, Section, Select, Table, Tabs, useAction } from "../components/ui";
import { useApi, useDictionaries } from "../hooks";
import { fmtDate, LINK_STATUS } from "../labels";

interface Profile {
  id: number; email: string; last_name: string; first_name: string; middle_name: string | null; birth_date: string | null;
  phone: string | null; municipality_id: number | null; is_minor: boolean; telegram_linked: boolean; telegram_link: string | null;
  athlete: null | {
    organization_id: number | null; start_year: number; training_stage: string | null; discipline_ids: number[];
    guardian_name: string | null; guardian_phone: string | null; rusada_course_date: string | null; rusada_certificate_url: string | null;
    ranks: { discipline: string; rank: string; valid_until: string | null }[];
  };
  consents: { id: number; kind: string; signed_by: string; signed_at: string; text_version: string }[];
}
type ProfileTab = "data" | "coaches" | "antidoping" | "notify";
interface Link_ { id: number; coach_name: string; athlete_name: string; discipline: string; status: string; events: { status: string; at: string; comment: string | null }[] }

export default function Profile() {
  const { me } = useAuth();
  const dicts = useDictionaries();
  const prof = useApi<Profile>("/api/me/profile");
  const links = useApi<Link_[]>(me?.active_role === "athlete" ? "/api/me/links" : null);
  const [f, setF] = useState<Record<string, string>>({});
  const [disc, setDisc] = useState<number[]>([]);
  const [rusada, setRusada] = useState({ date: "", url: "" });
  const save = useAction();
  const anti = useAction();
  const linkAct = useAction();
  const [tab, setTab] = useState<ProfileTab>("data");

  useEffect(() => {
    const p = prof.data;
    if (!p) return;
    setF({
      last_name: p.last_name, first_name: p.first_name, middle_name: p.middle_name ?? "", phone: p.phone ?? "",
      municipality_id: String(p.municipality_id ?? ""), organization_id: String(p.athlete?.organization_id ?? ""),
      start_year: String(p.athlete?.start_year ?? ""), guardian_name: p.athlete?.guardian_name ?? "", guardian_phone: p.athlete?.guardian_phone ?? "",
    });
    setDisc(p.athlete?.discipline_ids ?? []);
    setRusada({ date: p.athlete?.rusada_course_date ?? "", url: p.athlete?.rusada_certificate_url ?? "" });
  }, [prof.data]);

  if (!prof.data || !dicts) return <Loading />;
  const p = prof.data;
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const text = (k: string, label: string, type = "text") => (
    <Field label={label}>{(id) => <input id={id} type={type} className="input" value={f[k] ?? ""} onChange={(e) => set(k)(e.target.value)} />}</Field>
  );

  const submit = () => save.run(async () => {
    prof.setData(await api<Profile>("/api/me/profile", {
      method: "PUT",
      json: {
        ...f, middle_name: f.middle_name || null, phone: f.phone || null, municipality_id: f.municipality_id ? Number(f.municipality_id) : null,
        organization_id: f.organization_id ? Number(f.organization_id) : null, start_year: f.start_year ? Number(f.start_year) : null,
        discipline_ids: p.athlete ? disc : null, guardian_name: f.guardian_name || null, guardian_phone: f.guardian_phone || null,
      },
    }));
  }, "Профиль сохранён");

  const pending = links.data?.filter((l) => l.status === "pending") ?? [];
  const tabs: [ProfileTab, string][] = [
    ["data", "Личные данные"],
    ...(p.athlete ? [["coaches", "Тренеры"], ["antidoping", "Антидопинг"]] as [ProfileTab, string][] : []),
    ["notify", "Уведомления и согласия"],
  ];

  return (
    <>
      <PageHeader title="Профиль" lead={`${p.email}${p.birth_date ? `, дата рождения ${fmtDate(p.birth_date)}` : ""}`} />

      {pending.length > 0 && (
        <Section title="Запросы от тренеров">
          {linkAct.feedback}
          <ul className="cut-br divide-y divide-line bg-white px-4">
            {pending.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex-1"><div className="font-medium">{l.coach_name}</div><div className="text-sm text-ink-soft">хочет стать вашим тренером по дисциплине «{l.discipline}»</div></div>
                <button className="btn-primary btn-sm" disabled={linkAct.busy} onClick={() => linkAct.run(() => api(`/api/links/${l.id}/status`, { method: "POST", json: { status: "active" } }).then(() => { links.reload(); prof.reload(); }), "Тренер привязан")}>Подтвердить</button>
                <button className="btn-secondary btn-sm" disabled={linkAct.busy} onClick={() => linkAct.run(() => api(`/api/links/${l.id}/status`, { method: "POST", json: { status: "declined" } }).then(links.reload), "Запрос отклонён")}>Отклонить</button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "data" && <Section title="Личные данные">
        {save.feedback}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("last_name", "Фамилия")}
          {text("first_name", "Имя")}
          {text("middle_name", "Отчество")}
          {text("phone", "Телефон", "tel")}
          <Select label="Муниципалитет" value={f.municipality_id} onChange={set("municipality_id")} required={false} options={dicts.municipalities.map((m) => [m.id, m.name])} />
          {p.athlete && (
            <>
              <Select label="Организация" value={f.organization_id} onChange={set("organization_id")} required={false} placeholder="Без организации" options={dicts.organizations.map((o) => [o.id, o.name])} />
              {text("start_year", "Год начала занятий", "number")}
              <fieldset className="sm:col-span-2">
                <legend className="label">Дисциплины</legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {dicts.disciplines.map((d) => (
                    <label key={d.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={disc.includes(d.id)} onChange={(e) => setDisc(e.target.checked ? [...disc, d.id] : disc.filter((x) => x !== d.id))} />
                      {d.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </div>
        {p.athlete && p.is_minor && (
          <div className="mt-6 grid gap-4 rounded-xl bg-signal/5 p-4 sm:grid-cols-2">
            <p className="text-sm text-ink-soft sm:col-span-2">Законный представитель несовершеннолетнего</p>
            {text("guardian_name", "ФИО представителя")}
            {text("guardian_phone", "Телефон представителя", "tel")}
          </div>
        )}
        <button className="btn-primary mt-6" disabled={save.busy} onClick={submit}>Сохранить изменения</button>
      </Section>}

      {tab === "antidoping" && p.athlete && (
        <Section title="Онлайн-курс РУСАДА">
          {anti.feedback}
          <p className="mb-4 max-w-2xl text-sm text-ink-soft">
            Пройдите онлайн-курс РУСАДА и отметьте дату прохождения. Актуальные правила и перечень запрещённых веществ публикуются
            только на <a href="https://rusada.ru" target="_blank" rel="noreferrer">rusada.ru</a>, курс - в разделе
            <a href="https://rusada.ru/education/online-training/" target="_blank" rel="noreferrer"> «Онлайн-обучение»</a>.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Дата прохождения курса">{(id) => <input id={id} type="date" className="input" value={rusada.date} onChange={(e) => setRusada({ ...rusada, date: e.target.value })} />}</Field>
            <Field label="Ссылка на сертификат">{(id) => <input id={id} type="url" className="input" value={rusada.url} onChange={(e) => setRusada({ ...rusada, url: e.target.value })} />}</Field>
          </div>
          <button className="btn-secondary mt-4" disabled={anti.busy}
                  onClick={() => anti.run(() => api("/api/me/antidoping", { method: "PUT", json: { rusada_course_date: rusada.date || null, rusada_certificate_url: rusada.url || null } }).then(() => prof.reload()), "Отметка сохранена")}>
            Сохранить отметку
          </button>
        </Section>
      )}

      {tab === "coaches" && links.data?.filter((l) => l.status !== "pending").length === 0 && (
        <Empty>Тренеров пока нет. Тренер находит вас в реестре и отправляет запрос - он появится вверху этой страницы.</Empty>
      )}
      {tab === "coaches" && links.data && links.data.some((l) => l.status !== "pending") && (
        <Section title="Мои тренеры">
          {linkAct.feedback}
          <Table head={<><th>Тренер</th><th>Дисциплина</th><th>Статус</th><th>История</th><th /></>}>
            {links.data.filter((l) => l.status !== "pending").map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.coach_name}</td>
                <td>{l.discipline}</td>
                <td><Badge tone={LINK_STATUS[l.status].tone}>{LINK_STATUS[l.status].label}</Badge></td>
                <td className="text-sm text-ink-soft">{l.events.map((e) => `${fmtDate(e.at)}: ${LINK_STATUS[e.status]?.label.toLowerCase() ?? e.status}`).join("; ")}</td>
                <td className="text-right">
                  {(l.status === "active" || l.status === "suspended") && (
                    <button className="btn-quiet btn-sm" disabled={linkAct.busy}
                            onClick={() => window.confirm("Завершить работу с этим тренером?") && linkAct.run(() => api(`/api/links/${l.id}/status`, { method: "POST", json: { status: "ended" } }).then(links.reload), "Связь завершена")}>
                      Завершить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {tab === "notify" && <>
      <Section title="Уведомления в Telegram">
        {p.telegram_linked ? <p className="text-sm">Telegram подключён: уведомления дублируются в бот.</p> : p.telegram_link ? (
          <p className="text-sm">Откройте бот и нажмите «Start» - аккаунт привяжется автоматически. <a className="btn-primary btn-sm ml-2 text-white hover:text-white" href={p.telegram_link} target="_blank" rel="noreferrer">Подключить Telegram</a></p>
        ) : (
          <p className="max-w-2xl text-sm text-ink-soft">Бот федерации не настроен на этом сервере. Уведомления приходят в личный кабинет; администратор включает бот переменной FSP_TELEGRAM_BOT_TOKEN.</p>
        )}
      </Section>

      <Section title="Согласия на обработку персональных данных">
        {p.consents.length === 0 ? <Empty>Согласий нет.</Empty> : (
          <Table head={<><th>Согласие</th><th>Кем дано</th><th>Дата</th><th /></>}>
            {p.consents.map((c) => (
              <tr key={c.id}>
                <td>{c.kind === "pd_guardian" ? "Согласие законного представителя" : "Согласие на обработку персональных данных"}<div className="text-sm text-ink-muted">редакция {c.text_version}</div></td>
                <td>{c.signed_by}</td>
                <td className="whitespace-nowrap">{fmtDate(c.signed_at)}</td>
                <td className="text-right"><button className="btn-quiet btn-sm" onClick={dl(`/api/me/consents/${c.id}.docx`, `согласие_${c.id}.docx`)}>Скачать .docx</button></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      </>}
    </>
  );
}
