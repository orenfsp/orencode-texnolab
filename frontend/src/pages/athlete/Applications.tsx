import { Link } from "react-router-dom";
import { api, type Application } from "../../api";
import { useAuth } from "../../auth";
import { Badge, Empty, Loading, PageHeader, Table, useAction } from "../../components/ui";
import { useApi } from "../../hooks";
import { APPLICATION_STATUS, fmtDate } from "../../labels";

export default function Applications() {
  const { me } = useAuth();
  const { data, reload } = useApi<Application[]>("/api/me/applications");
  const { busy, run, feedback } = useAction();
  const isCoach = me?.active_role === "coach";

  return (
    <>
      <PageHeader title={isCoach ? "Заявки за спортсменов" : "Мои заявки"}
                  lead="Отозвать заявку можно, пока идёт приём заявок. После закрытия приёма - только через федерацию." />
      {feedback}
      {!data ? <Loading /> : data.length === 0 ? (
        <Empty action={<Link to="/calendar" className="btn-primary text-white hover:text-white">Открыть календарь</Link>}>Заявок пока нет.</Empty>
      ) : (
        <Table head={<><th>Соревнование</th>{isCoach && <th>Спортсмен</th>}<th>Подана</th><th>Статус</th><th /></>}>
          {data.map((a) => (
            <tr key={a.id}>
              <td><Link to={`/competitions/${a.competition_id}`} className="font-medium text-ink hover:text-fed">{a.competition_title}</Link></td>
              {isCoach && <td>{a.athlete_name}</td>}
              <td className="whitespace-nowrap">{fmtDate(a.created_at)}{a.submitted_as === "coach" && !isCoach && <div className="text-xs text-ink-muted">подал тренер</div>}</td>
              <td><Badge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</Badge>{a.comment && <div className="mt-1 text-xs text-ink-soft">{a.comment}</div>}</td>
              <td className="text-right">
                {a.status === "submitted" && (
                  <button className="btn-quiet btn-sm" disabled={busy}
                          onClick={() => run(() => api(`/api/applications/${a.id}/withdraw`, { method: "POST" }).then(reload), "Заявка отозвана")}>
                    Отозвать
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
