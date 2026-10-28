import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, dl, type Application, type Competition, type CompetitionStatus, type Protocol } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Dialog, DownloadButtons, Empty, Field, Loading, PageHeader, Place, Section, Select, Table, Tabs, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { APPLICATION_STATUS, COMPETITION_STATUS, fmtDate, fmtRange, FORMAT, LEVEL, PLAN, RATING_LEVEL } from "../../labels";
import { ViolationForm } from "../judge/Judging";
import { CompetitionForm } from "./Competitions";

const NEXT: Partial<Record<CompetitionStatus, { to: CompetitionStatus; label: string }[]>> = {
  draft: [{ to: "registration_open", label: "Опубликовать и открыть приём заявок" }],
  registration_open: [{ to: "registration_closed", label: "Закрыть приём заявок" }],
  registration_closed: [{ to: "registration_open", label: "Открыть приём снова" }],
};

type TabKey = "info" | "apps" | "judges" | "protocol";

const NEXT_STEP: Record<CompetitionStatus, string> = {
  draft: "Черновик видит только федерация. Проверьте сведения, загрузите положение и откройте приём заявок.",
  registration_open: "Идёт приём заявок. Рассматривайте заявки и закройте приём, когда срок истечёт.",
  registration_closed: "Приём закрыт. Внесите баллы во вкладке «Результаты» и опубликуйте протокол.",
  completed: "Протокол опубликован, результаты попали в историю спортсменов.",
  cancelled: "Соревнование отменено.",
};

interface Panel { id: number; judge_id: number; full_name: string; position: string; category: string | null }

export default function CompetitionDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const isAdmin = me?.active_role === "admin";
  const comp = useApi<Competition>(`/api/competitions/${id}`);
  const apps = useApi<Application[]>(`/api/competitions/${id}/applications`);
  const { busy, run, feedback } = useAction();
  const [edit, setEdit] = useState(false);
  const [reject, setReject] = useState<Application | null>(null);
  const [comment, setComment] = useState("");
  const [violation, setViolation] = useState(false);
  const [tab, setTab] = useState<TabKey | null>(null);

  const act = (fn: () => Promise<unknown>, msg: string) => run(async () => { await fn(); await Promise.all([comp.reload(), apps.reload()]); }, msg);

  if (comp.error) return <PageHeader title="Соревнование не найдено" back={{ to: "/admin/competitions", label: "Календарь" }} />;
  if (!comp.data) return <Loading />;
  const c = comp.data;
  const st = COMPETITION_STATUS[c.status];
  const pending = apps.data?.filter((a) => a.status === "submitted").length ?? 0;
  const hasProtocol = c.status === "registration_closed" || c.status === "completed";
  const current: TabKey = tab ?? (c.status === "draft" ? "info" : c.status === "registration_open" ? "apps" : hasProtocol ? "protocol" : "info");
  const tabs: [TabKey, string][] = [
    ["info", "Сведения"],
    ["apps", `Заявки${apps.data ? ` (${apps.data.length})` : ""}${pending ? `, ждут решения: ${pending}` : ""}`],
    ["judges", "Судейская коллегия"],
    ...(hasProtocol ? [["protocol", c.status === "completed" ? "Протокол" : "Результаты"] as [TabKey, string]] : []),
  ];

  return (
    <>
      <PageHeader title={c.title} back={{ to: "/admin/competitions", label: "Календарь" }}
                  lead={<>
                    <span className="flex flex-wrap items-center gap-2"><Badge tone={st.tone}>{st.label}</Badge>{c.discipline.name}, {fmtRange(c.start_date, c.end_date)}</span>
                    {isAdmin && <p className="mt-2 text-sm">{NEXT_STEP[c.status]}{c.status === "registration_open" && pending > 0 && ` Сейчас на модерации: ${pending}.`}</p>}
                  </>}
                  actions={isAdmin && (
                    <>
                      {c.status !== "completed" && <button className="btn-secondary" onClick={() => setEdit(true)}>Изменить</button>}
                      {NEXT[c.status]?.map((n) => (
                        <button key={n.to} className="btn-primary" disabled={busy}
                                onClick={() => act(() => api(`/api/competitions/${c.id}/status`, { method: "POST", json: { status: n.to } }), `Статус: ${COMPETITION_STATUS[n.to].label.toLowerCase()}`)}>
                          {n.label}
                        </button>
                      ))}
                    </>
                  )} />
      {feedback}
      <Tabs tabs={tabs} value={current} onChange={setTab} />

      {current === "info" && <dl className="mb-10 grid gap-x-8 gap-y-4 border-y border-line py-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Даты" value={fmtRange(c.start_date, c.end_date)} />
        <Info label="Приём заявок до" value={fmtDate(c.registration_deadline)} />
        <Info label="Статус и тип" value={`${LEVEL[c.level]}, ${c.type.name.toLowerCase()}`} />
        <Info label="Уровень в рейтинге" value={RATING_LEVEL[c.rating_level]} />
        <Info label="Возрастная группа" value={c.age_group.name} />
        <Info label="Формат" value={FORMAT[c.format] + (c.format_details ? `: ${c.format_details.toLowerCase()}` : "")} />
        <Info label="Место" value={c.venue ?? "-"} />
        <Info label="Календарный план" value={PLAN[c.calendar_plan] + (c.calendar_plan_number ? `, № ${c.calendar_plan_number}` : "")} />
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="text-ink-muted">Положение (регламент)</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-3">
            {c.has_regulation ? <a href={`/api/competitions/${c.id}/regulation`}>Скачать положение</a> : <span className="text-ink-muted">не загружено</span>}
            {isAdmin && c.status !== "completed" && (
              <label className="btn-secondary btn-sm cursor-pointer">
                {c.has_regulation ? "Заменить файл" : "Загрузить PDF или DOCX"}
                <input type="file" accept=".pdf,.doc,.docx" className="sr-only"
                       onChange={(e) => {
                         const file = e.target.files?.[0];
                         if (!file) return;
                         const body = new FormData();
                         body.append("file", file);
                         act(() => api(`/api/competitions/${c.id}/regulation`, { method: "POST", body }), "Положение загружено");
                       }} />
              </label>
            )}
          </dd>
        </div>
      </dl>}

      {current === "apps" && <div className="mb-12">
        {!apps.data ? <Loading /> : apps.data.length === 0 ? <Empty>Заявок пока нет.</Empty> : (
          <Table head={<><th>Спортсмен</th><th>Организация</th><th>Подал</th><th>Статус</th><th /></>}>
            {apps.data.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.athlete_name}<div className="text-xs font-normal text-ink-muted">{a.athlete_birth_year} г. р.</div></td>
                <td>{a.organization}</td>
                <td className="text-sm">{a.submitted_as === "coach" ? `тренер ${a.submitted_by_name}` : "сам спортсмен"}</td>
                <td><Badge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</Badge>{a.comment && <div className="mt-1 text-xs text-ink-soft">{a.comment}</div>}</td>
                <td className="whitespace-nowrap text-right">
                  {isAdmin && a.status === "submitted" && c.status !== "completed" && (
                    <>
                      <button className="btn-primary btn-sm" disabled={busy} onClick={() => act(() => api(`/api/applications/${a.id}/approve`, { method: "POST" }), "Заявка одобрена")}>Одобрить</button>{" "}
                      <button className="btn-danger btn-sm" disabled={busy} onClick={() => { setReject(a); setComment(""); }}>Отклонить</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>}

      {current === "judges" && <JudgesPanel comp={c} editable={isAdmin && c.status !== "completed"} />}

      {current === "protocol" && hasProtocol && (
        <ResultsSection comp={c} editable={isAdmin && c.status === "registration_closed"} onPublished={comp.reload}
                        onViolation={isAdmin ? () => setViolation(true) : undefined} />
      )}

      <Dialog open={edit} onClose={() => setEdit(false)} title="Изменить соревнование">
        <CompetitionForm initial={c} onSaved={(n) => { comp.setData(n); setEdit(false); }} />
      </Dialog>
      <Dialog open={!!reject} onClose={() => setReject(null)} title="Отклонить заявку">
        <p className="mb-3 text-sm text-ink-soft">{reject?.athlete_name}. Причину увидят спортсмен и тренер.</p>
        <Field label="Причина отклонения">{(id) => <textarea id={id} className="input min-h-20" value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
        <button className="btn-danger mt-4" disabled={busy || !comment}
                onClick={() => act(() => api(`/api/applications/${reject!.id}/reject`, { method: "POST", json: { comment } }).then(() => setReject(null)), "Заявка отклонена")}>Отклонить заявку</button>
      </Dialog>
      <Dialog open={violation} onClose={() => setViolation(false)} title="Рапорт о нарушении">
        <ViolationForm comp={{ competition_id: c.id, title: c.title }} onDone={() => setViolation(false)} />
      </Dialog>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-ink-muted">{label}</dt><dd className="mt-1">{value}</dd></div>;
}

function JudgesPanel({ comp, editable }: { comp: Competition; editable: boolean }) {
  const dicts = useDictionaries();
  const panel = useApi<Panel[]>(`/api/competitions/${comp.id}/judges`);
  const judges = useApi<{ id: number; full_name: string; category: string | null }[]>(editable ? "/api/admin/registry/judges" : null);
  const [judge, setJudge] = useState("");
  const [position, setPosition] = useState("");
  const { busy, run, feedback } = useAction();
  const free = (judges.data ?? []).filter((j) => !panel.data?.some((p) => p.judge_id === j.id));

  return (
    <Section title="Судейская коллегия" actions={<button className="btn-secondary btn-sm" onClick={dl(`/api/competitions/${comp.id}/judges.docx`, `коллегия_${comp.id}.docx`)}>Справка о составе .docx</button>}>
      {feedback}
      {panel.data?.length === 0 ? <Empty>Судьи не назначены.</Empty> : (
        <Table head={<><th>Судья</th><th>Должность</th><th>Категория</th><th /></>}>
          {panel.data?.map((p) => (
            <tr key={p.id}>
              <td className="font-medium">{p.full_name}</td>
              <td>{p.position}</td>
              <td className="text-sm">{p.category ?? "-"}</td>
              <td className="text-right">{editable && <button className="btn-quiet btn-sm" disabled={busy} onClick={() => run(() => api<Panel[]>(`/api/competitions/${comp.id}/judges/${p.id}`, { method: "DELETE" }).then(panel.setData))}>Снять</button>}</td>
            </tr>
          ))}
        </Table>
      )}
      {editable && (
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select label="Судья" value={judge} onChange={setJudge} options={free.map((j) => [j.id, `${j.full_name}${j.category ? `, ${j.category.toLowerCase()}` : ""}`])} />
          <Select label="Судейская должность" value={position} onChange={setPosition} options={dicts?.judge_positions.map((p) => [p.id, p.name]) ?? []} />
          <button className="btn-primary" disabled={busy || !judge || !position}
                  onClick={() => run(() => api<Panel[]>(`/api/competitions/${comp.id}/judges`, { method: "POST", json: { judge_id: Number(judge), position_id: Number(position) } }).then((d) => { panel.setData(d); setJudge(""); }), "Судья назначен, ему отправлено уведомление")}>
            Назначить
          </button>
        </div>
      )}
    </Section>
  );
}

function ResultsSection({ comp, editable, onPublished, onViolation }: { comp: Competition; editable: boolean; onPublished: () => void; onViolation?: () => void }) {
  const proto = useApi<Protocol>(`/api/competitions/${comp.id}/protocol`);
  const [draft, setDraft] = useState<Record<number, { score: string; note: string }>>({});
  const [dirty, setDirty] = useState(false);
  const { busy, run, feedback } = useAction();

  useEffect(() => {
    if (proto.data) setDraft(Object.fromEntries(proto.data.rows.map((r) => [r.athlete_id, { score: r.score?.toString() ?? "", note: r.note ?? "" }])));
  }, [proto.data]);

  const save = () => run(async () => {
    const rows = Object.entries(draft).map(([athlete_id, v]) => ({ athlete_id: Number(athlete_id), score: v.score === "" ? null : Number(v.score.replace(",", ".")), note: v.note || null }));
    proto.setData(await api<Protocol>(`/api/competitions/${comp.id}/results`, { method: "PUT", json: rows }));
    setDirty(false);
  }, "Результаты сохранены, места пересчитаны");

  const publish = () => window.confirm("Опубликовать протокол? Результаты попадут в историю спортсменов, участники получат уведомления.") &&
    run(async () => { proto.setData(await api<Protocol>(`/api/competitions/${comp.id}/protocol/publish`, { method: "POST" })); onPublished(); }, "Протокол опубликован");

  const edit = (aid: number, k: "score" | "note", v: string) => { setDirty(true); setDraft({ ...draft, [aid]: { ...draft[aid], [k]: v } }); };

  if (!proto.data) return <Loading />;
  const p = proto.data;
  return (
    <Section title={p.number ? `Протокол № ${p.number}` : "Результаты и черновик протокола"}
             actions={<>
               <DownloadButtons items={[
                 { label: "Протокол .xlsx", onClick: dl(`/api/competitions/${comp.id}/protocol.xlsx`, `протокол_${comp.id}.xlsx`) },
                 { label: ".docx", onClick: dl(`/api/competitions/${comp.id}/protocol.docx`, `протокол_${comp.id}.docx`) },
               ]} />
               {p.number && <Link className="btn-secondary btn-sm" to={`/protocols/${comp.id}`}>Публичная страница</Link>}
               {onViolation && <button className="btn-secondary btn-sm" onClick={onViolation}>Рапорт о нарушении</button>}
             </>}>
      {feedback}
      {editable && <p className="mb-4 max-w-3xl text-sm text-ink-soft">В протокол попадают все участники с одобренной заявкой. Введите баллы: места рассчитаются по убыванию, при равных баллах место одинаковое.</p>}
      {p.rows.length === 0 ? <Empty>Нет одобренных заявок - некого вносить в протокол.</Empty> : (
        <Table head={<><th>Место</th><th>Участник</th><th>Организация</th><th>Разряд</th><th className="w-32">Баллы</th><th>Примечание</th></>}>
          {p.rows.map((r) => (
            <tr key={r.athlete_id}>
              <td><Place place={r.place} /></td>
              <td className="font-medium">{r.full_name}<div className="text-xs font-normal text-ink-muted">{r.birth_year} г. р., {r.municipality}</div>
                {r.evsk_hint && <div className="mt-1"><Badge tone="blue">Может претендовать: {r.evsk_hint.toLowerCase()}</Badge></div>}</td>
              <td className="text-sm">{r.organization}</td>
              <td className="text-sm">{r.rank ?? "б/р"}</td>
              <td>{editable ? <input aria-label={`Баллы: ${r.full_name}`} className="input num" inputMode="decimal" value={draft[r.athlete_id]?.score ?? ""} onChange={(e) => edit(r.athlete_id, "score", e.target.value)} /> : <span className="num">{r.score ?? "-"}</span>}</td>
              <td>{editable ? <input aria-label={`Примечание: ${r.full_name}`} className="input" value={draft[r.athlete_id]?.note ?? ""} onChange={(e) => edit(r.athlete_id, "note", e.target.value)} /> : r.note}</td>
            </tr>
          ))}
        </Table>
      )}
      {editable && p.rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-secondary" disabled={busy || !dirty} onClick={save}>Сохранить и пересчитать места</button>
          <button className="btn-primary" disabled={busy || dirty || !p.rows.some((r) => r.score !== null)} onClick={publish}>Опубликовать протокол</button>
          {dirty && <span className="text-sm text-signal">Есть несохранённые изменения</span>}
        </div>
      )}
    </Section>
  );
}
