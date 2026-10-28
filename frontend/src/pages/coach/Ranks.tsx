import { useEffect, useState } from "react";
import { api, type HistoryItem } from "../../api";
import Deadlines from "../../components/Deadlines";
import { Badge, Dialog, Empty, Loading, PageHeader, Place, Section, Select, Table, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { fmtDate, REQUEST_STATUS } from "../../labels";

interface Pupil { athlete_id: number; full_name: string; status: string }
interface Req { id: number; athlete_name: string; rank: string; competition: string; place: number | null; status: string; comment: string | null; created_at: string }
type Row = HistoryItem & { athlete_id: number; athlete_name: string };

export default function CoachRanks() {
  const dicts = useDictionaries();
  const pupils = useApi<Pupil[]>("/api/me/athletes");
  const requests = useApi<Req[]>("/api/me/rank-requests");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [rankId, setRankId] = useState("");
  const [kind, setKind] = useState("assign");
  const { busy, run, feedback } = useAction();

  useEffect(() => {
    if (!pupils.data) return;
    const active = [...new Map(pupils.data.filter((p) => p.status === "active").map((p) => [p.athlete_id, p])).values()];
    Promise.all(active.map((p) => api<HistoryItem[]>(`/api/me/athletes/${p.athlete_id}/results`).then((h) => h.map((x) => ({ ...x, athlete_id: p.athlete_id, athlete_name: p.full_name })))))
      .then((all) => setRows(all.flat().filter((r) => r.evsk_hint).sort((a, b) => b.start_date.localeCompare(a.start_date))));
  }, [pupils.data]);

  return (
    <>
      <PageHeader title="Разряды подопечных" lead="Результаты из протоколов, которые могут соответствовать требованиям ЕВСК. По ним можно подать заявку на присвоение или подтверждение разряда." />
      {feedback}
      <Section title="Сроки действия разрядов"><Deadlines /></Section>
      <Section title="Результаты на разряд">
        {!rows ? <Loading /> : rows.length === 0 ? <Empty>Подходящих результатов у подопечных пока нет.</Empty> : (
          <Table head={<><th>Место</th><th>Спортсмен</th><th>Соревнование</th><th>Может претендовать</th><th /></>}>
            {rows.map((r) => (
              <tr key={r.result_id}>
                <td><Place place={r.place} /></td>
                <td className="font-medium">{r.athlete_name}</td>
                <td>{r.competition_title}<div className="text-xs text-ink-muted">{fmtDate(r.start_date)}</div></td>
                <td><Badge tone="blue">{r.evsk_hint}</Badge></td>
                <td className="text-right"><button className="btn-primary btn-sm" onClick={() => { setTarget(r); setRankId(String(dicts?.sport_ranks.find((x) => x.name === r.evsk_hint)?.id ?? "")); }}>Подать заявку</button></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Section title="Поданные заявки">
        {requests.data?.length === 0 ? <Empty>Заявок на разряд пока нет.</Empty> : (
          <Table head={<><th>Спортсмен</th><th>Разряд</th><th>Основание</th><th>Статус</th></>}>
            {requests.data?.map((r) => (
              <tr key={r.id}>
                <td>{r.athlete_name}</td>
                <td>{r.rank}</td>
                <td className="text-sm">{r.competition}, место {r.place}</td>
                <td><Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>{r.comment && <div className="mt-1 text-xs text-ink-soft">{r.comment}</div>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Dialog open={!!target} onClose={() => setTarget(null)} title="Заявка на разряд">
        <p className="mb-4 text-sm text-ink-soft">{target?.athlete_name}: {target?.competition_title}, {target?.place} место.</p>
        <div className="grid gap-4">
          <Select label="Разряд" value={rankId} onChange={setRankId} options={dicts?.sport_ranks.map((r) => [r.id, r.name]) ?? []} />
          <Select label="Тип заявки" value={kind} onChange={setKind} options={[["assign", "Присвоение"], ["confirm", "Подтверждение"]]} />
        </div>
        <button className="btn-primary mt-4" disabled={busy || !rankId}
                onClick={() => run(async () => {
                  await api("/api/rank-requests", { method: "POST", json: { result_id: target!.result_id, rank_id: Number(rankId), kind, athlete_id: target!.athlete_id } });
                  setTarget(null);
                  requests.reload();
                }, "Заявка отправлена в федерацию")}>Отправить в федерацию</button>
      </Dialog>
    </>
  );
}
