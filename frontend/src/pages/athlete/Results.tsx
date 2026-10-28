import { useState } from "react";
import { Link } from "react-router-dom";
import { api, dl, type HistoryItem } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Dialog, Empty, Field, Loading, PageHeader, Place, RowMenu, Select, Table, Tabs, useAction, type MenuItem } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { daysWord, fmtDate, LEVEL, REQUEST_STATUS } from "../../labels";

interface RankInfo { discipline: string; rank: string; assigned_at: string; order_number: string; valid_until: string | null; days_left: number | null }
interface RankRequest { id: number; rank: string; competition: string; place: number | null; status: string; comment: string | null; created_at: string; athlete_name: string; kind: string }
interface Cert { id: number; number: string; competition: string; place: number | null; verify_url: string; issued_at: string; purpose: string | null }

export function HistoryTable({ items, menu }: { items: HistoryItem[]; menu?: (h: HistoryItem) => MenuItem[] }) {
  if (items.length === 0) return <Empty>Выступлений пока нет. Результаты появятся здесь после публикации протокола.</Empty>;
  return (
    <Table head={<><th>Место</th><th>Соревнование</th><th>Дата</th><th className="text-right">Баллы</th><th /></>}>
      {items.map((h) => (
        <tr key={h.competition_id}>
          <td className="w-16"><Place place={h.place} /></td>
          <td>
            <Link to={h.protocol_url} className="font-medium text-ink hover:text-fed">{h.competition_title}</Link>
            <div className="text-sm text-ink-muted">{LEVEL[h.level]}, участников: {h.participants}</div>
            {h.evsk_hint && <div className="mt-1"><Badge tone="blue">Результат на разряд: {h.evsk_hint.toLowerCase()}</Badge></div>}
          </td>
          <td className="whitespace-nowrap">{fmtDate(h.start_date)}</td>
          <td className="num text-right">{h.score ?? "-"}</td>
          <td className="text-right">{menu && <RowMenu items={menu(h)} />}</td>
        </tr>
      ))}
    </Table>
  );
}

type Tab = "history" | "rank" | "certs";

export default function Results() {
  const { me } = useAuth();
  const dicts = useDictionaries();
  const history = useApi<HistoryItem[]>("/api/me/results");
  const ranks = useApi<RankInfo[]>("/api/me/ranks");
  const requests = useApi<RankRequest[]>("/api/me/rank-requests");
  const certs = useApi<Cert[]>("/api/me/certificates");
  const [tab, setTab] = useState<Tab>("history");
  const [rankFor, setRankFor] = useState<HistoryItem | null>(null);
  const [certFor, setCertFor] = useState<HistoryItem | null>(null);
  const { busy, run, feedback } = useAction();
  const [rankId, setRankId] = useState("");
  const [kind, setKind] = useState("assign");
  const [purpose, setPurpose] = useState("");
  const expiring = ranks.data?.filter((r) => r.days_left !== null && r.days_left >= 0 && r.days_left <= 60) ?? [];

  return (
    <>
      <PageHeader title="Результаты и разряд" lead={expiring.length > 0 && (
        <span className="text-signal">Скоро истекает разряд: {expiring.map((r) => `${r.rank.toLowerCase()} (${r.discipline.toLowerCase()})`).join(", ")}.</span>
      )} />
      {feedback}
      <Tabs tabs={[["history", `Выступления${history.data ? ` (${history.data.length})` : ""}`], ["rank", "Разряд"], ["certs", "Справки"]]} value={tab} onChange={setTab} />

      {tab === "history" && (
        <>
          {!history.data ? <Loading /> : (
            <HistoryTable items={history.data} menu={(h) => [
              { label: "Открыть протокол", to: h.protocol_url },
              { label: "Получить справку об участии", onClick: () => { setCertFor(h); setPurpose(""); } },
              { label: "Подать заявку на разряд", onClick: () => { setRankFor(h); setRankId(""); }, hidden: !h.place },
            ]} />
          )}
          {me && history.data && history.data.length > 0 && (
            <p className="mt-6 text-sm text-ink-soft">
              Отчёт о всех выступлениях: <button className="btn-quiet btn-sm" onClick={dl(`/api/athletes/${me.id}/participation.docx`, "выступления.docx")}>.docx</button>
              <button className="btn-quiet btn-sm" onClick={dl(`/api/athletes/${me.id}/participation.xlsx`, "выступления.xlsx")}>.xlsx</button>
            </p>
          )}
        </>
      )}

      {tab === "rank" && (
        <>
          {ranks.data?.length === 0 && <Empty>Разряд пока не присвоен. Что для этого нужно - в разделе <Link to="/athlete/path">«Мой путь»</Link>.</Empty>}
          <div className="grid gap-8 sm:grid-cols-2">
            {ranks.data?.map((r, i) => {
              const soon = r.days_left !== null && r.days_left >= 0 && r.days_left <= 60;
              return (
                <div key={i} className="tile">
                  <div className="text-sm text-ink-soft">{r.discipline}</div>
                  <div className="mt-1 text-lg font-extrabold text-plum">{r.rank}</div>
                  <div className="mt-2 text-sm text-ink-soft">Присвоен {fmtDate(r.assigned_at)}, приказ {r.order_number}</div>
                  <div className={`mt-1 text-sm ${soon ? "font-semibold text-signal" : ""}`}>
                    {r.valid_until ? `Действует до ${fmtDate(r.valid_until)}` : "Бессрочно"}
                    {soon && `, осталось ${r.days_left} ${daysWord(r.days_left!)}`}
                    {r.days_left !== null && r.days_left < 0 && ": срок истёк"}
                  </div>
                </div>
              );
            })}
          </div>
          {requests.data && requests.data.length > 0 && (
            <>
              <h2 className="mb-3 mt-10 text-lg font-bold">Заявки на разряд</h2>
              <Table head={<><th>Разряд</th><th>Основание</th><th>Статус</th></>}>
                {requests.data.map((r) => (
                  <tr key={r.id}>
                    <td>{r.rank}<div className="text-sm text-ink-muted">{r.kind === "assign" ? "присвоение" : "подтверждение"}, от {fmtDate(r.created_at)}</div></td>
                    <td>{r.competition}, место {r.place ?? "-"}</td>
                    <td><Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>{r.comment && <div className="mt-1 text-sm text-ink-soft">{r.comment}</div>}</td>
                  </tr>
                ))}
              </Table>
            </>
          )}
          <p className="mt-6 text-sm text-ink-soft">Заявка на разряд подаётся из вкладки «Выступления» по конкретному результату. Если у вас есть тренер по дисциплине, заявку подаёт он.</p>
        </>
      )}

      {tab === "certs" && (
        !certs.data ? <Loading /> : certs.data.length === 0 ? (
          <Empty>Справок пока нет. Получить справку можно во вкладке «Выступления» через меню «Действия» у нужного соревнования.</Empty>
        ) : (
          <Table head={<><th>Номер</th><th>Соревнование</th><th>Выдана</th><th /></>}>
            {certs.data.map((c) => (
              <tr key={c.id}>
                <td className="tabular-nums whitespace-nowrap">{c.number}</td>
                <td>{c.competition}{c.purpose && <div className="text-sm text-ink-muted">для: {c.purpose}</div>}</td>
                <td className="whitespace-nowrap">{fmtDate(c.issued_at)}</td>
                <td className="text-right">
                  <RowMenu items={[
                    { label: "Скачать .docx с QR-кодом", onClick: dl(`/api/certificates/${c.id}.docx`, `справка_${c.number}.docx`) },
                    { label: "Открыть страницу проверки", onClick: () => window.open(c.verify_url, "_blank", "noopener") },
                  ]} />
                </td>
              </tr>
            ))}
          </Table>
        )
      )}

      <Dialog open={!!certFor} onClose={() => setCertFor(null)} title="Справка об участии">
        <p className="mb-4 text-sm text-ink-soft">{certFor?.competition_title}. Справка получит номер и QR-код для проверки подлинности.</p>
        <Field label="Для чего справка" hint="Например: портфолио, поступление, стипендия">{(id) => <input id={id} className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} />}</Field>
        <button className="btn-primary mt-4" disabled={busy}
                onClick={() => run(async () => {
                  await api("/api/me/certificates", { method: "POST", json: { result_id: certFor!.result_id, purpose: purpose || null } });
                  setCertFor(null);
                  certs.reload();
                  setTab("certs");
                }, "Справка выдана")}>Получить справку</button>
      </Dialog>

      <Dialog open={!!rankFor} onClose={() => setRankFor(null)} title="Заявка на разряд">
        <p className="mb-4 text-sm text-ink-soft">Основание: {rankFor?.competition_title}, {rankFor?.place} место.</p>
        <div className="grid gap-4">
          <Select label="Разряд" value={rankId} onChange={setRankId} options={dicts?.sport_ranks.map((r) => [r.id, r.name]) ?? []} />
          <Select label="Тип заявки" value={kind} onChange={setKind} options={[["assign", "Присвоение"], ["confirm", "Подтверждение"]]} />
        </div>
        {rankFor?.evsk_hint && <p className="hint">По нормам ЕВСК результат может соответствовать разряду «{rankFor.evsk_hint}».</p>}
        <button className="btn-primary mt-4" disabled={busy || !rankId}
                onClick={() => run(async () => {
                  await api("/api/rank-requests", { method: "POST", json: { result_id: rankFor!.result_id, rank_id: Number(rankId), kind } });
                  setRankFor(null);
                  requests.reload();
                  setTab("rank");
                }, "Заявка на разряд отправлена в федерацию")}>Отправить заявку</button>
      </Dialog>
    </>
  );
}
