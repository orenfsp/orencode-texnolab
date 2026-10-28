import { useParams } from "react-router-dom";
import { Loading, Notice, Place } from "../../components/ui";
import { useApi } from "../../hooks";
import { fmtDate } from "../../labels";

interface Cert {
  valid: boolean; number: string; competition: string; competition_date: string; discipline: string;
  place: number | null; participants: number; athlete_name: string; purpose: string | null; issued_at: string;
}

export default function Verify() {
  const { code } = useParams();
  const { data, error } = useApi<Cert>(`/api/public/certificates/${code}`);
  if (error) return <div className="max-w-xl"><h1 className="text-2xl font-bold">Справка не найдена</h1><Notice>Справка с таким кодом не выдавалась федерацией. Проверьте адрес из QR-кода.</Notice></div>;
  if (!data) return <Loading />;
  return (
    <div className="max-w-xl">
      <Notice tone="green">Справка подлинная: выдана региональным отделением ФСП Оренбургской области.</Notice>
      <h1 className="text-2xl font-bold">Справка № {data.number}</h1>
      <div className="mt-6 flex items-center gap-4">
        <Place place={data.place} size="lg" />
        <div>
          <div className="text-lg font-semibold">{data.athlete_name}</div>
          <div className="text-ink-soft">{data.place ? `${data.place} место из ${data.participants}` : "участие без итогового места"}</div>
        </div>
      </div>
      <dl className="mt-6 grid gap-3 text-sm">
        <div><dt className="text-ink-muted">Соревнование</dt><dd>{data.competition}</dd></div>
        <div><dt className="text-ink-muted">Дисциплина</dt><dd>{data.discipline}</dd></div>
        <div><dt className="text-ink-muted">Дата соревнования</dt><dd>{fmtDate(data.competition_date)}</dd></div>
        <div><dt className="text-ink-muted">Дата выдачи справки</dt><dd>{fmtDate(data.issued_at)}</dd></div>
      </dl>
    </div>
  );
}
