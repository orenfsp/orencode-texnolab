import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, type Competition } from "../api";
import { useAuth } from "../auth";
import { DeadlineStrip } from "../components/Deadlines";
import { Badge, Empty, ErrorBox, Field, Loading, PageHeader, Select } from "../components/ui";
import { useApi, useDictionaries } from "../hooks";
import { APPLICATION_STATUS, COMPETITION_STATUS, fmtDate, FORMAT, LEVEL } from "../labels";

interface Pupil { athlete_id: number; full_name: string; birth_year: number | null; discipline_id: number; discipline: string; status: string }

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function DateBlock({ start, end }: { start: string; end: string }) {
  const s = new Date(start + "T00:00:00"), e = new Date(end + "T00:00:00");
  const days = s.getTime() === e.getTime() ? `${s.getDate()}` : `${s.getDate()}–${e.getDate()}`;
  return (
    <div className="w-16 shrink-0 text-center">
      <div className="num text-xl font-bold leading-none">{days}</div>
      <div className="mt-1 text-sm text-ink-soft">{MONTHS[s.getMonth()]}</div>
      <div className="text-xs text-ink-muted">{s.getFullYear()}</div>
    </div>
  );
}

export default function Calendar() {
  const { me } = useAuth();
  const dicts = useDictionaries();
  const isCoach = me?.active_role === "coach";
  const pupils = useApi<Pupil[]>(isCoach ? "/api/me/athletes" : null);
  const [discipline, setDiscipline] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [pupil, setPupil] = useState("");

  const params = new URLSearchParams();
  if (discipline) params.set("discipline_id", discipline);
  if (ageGroup) params.set("age_group_id", ageGroup);
  if (onlyEligible) params.set("eligible_only", "true");
  if (isCoach && pupil) params.set("for_athlete_id", pupil);
  const list = useApi<Competition[]>(`/api/competitions?${params}`);

  const isPast = (c: Competition) => c.status === "completed" || c.status === "cancelled";
  const items = (list.data ?? []).filter((c) => showPast === isPast(c));
  if (showPast) items.reverse();
  const activePupils = (pupils.data ?? []).filter((p) => p.status === "active");
  const uniquePupils = [...new Map(activePupils.map((p) => [p.athlete_id, p])).values()];

  return (
    <>
      <PageHeader title="Календарь соревнований"
                  lead={isCoach ? "Выберите спортсмена: платформа покажет, куда он проходит по возрасту, и вы подадите заявку за него." : "Платформа сама отмечает соревнования, куда вы проходите по возрасту."} />
      <DeadlineStrip />
      <div>
        <div className="min-w-0">
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isCoach && (
              <Select label="Спортсмен" value={pupil} onChange={setPupil} required={false} placeholder="Не выбран"
                      options={uniquePupils.map((p) => [p.athlete_id, `${p.full_name}, ${p.birth_year}`])} />
            )}
            <Select label="Дисциплина" value={discipline} onChange={setDiscipline} required={false} placeholder="Все дисциплины"
                    options={dicts?.disciplines.map((d) => [d.id, d.name]) ?? []} />
            <Select label="Возрастная группа" value={ageGroup} onChange={setAgeGroup} required={false} placeholder="Все группы"
                    options={dicts?.age_groups.map((g) => [g.id, g.name]) ?? []} />
            <Field label="Показать">
              {(id) => (
                <select id={id} className="input" value={showPast ? "past" : "next"} onChange={(e) => setShowPast(e.target.value === "past")}>
                  <option value="next">Предстоящие</option>
                  <option value="past">Прошедшие</option>
                </select>
              )}
            </Field>
          </div>
          {(!isCoach || pupil) && (
            <label className="mb-6 flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)} />
              Только те, куда {isCoach ? "спортсмен проходит" : "я прохожу"} по возрасту
            </label>
          )}
          <ErrorBox message={list.error} />
          {!list.data ? <Loading /> : items.length === 0 ? <Empty>По этим фильтрам соревнований нет. Сбросьте дисциплину или возрастную группу.</Empty> : (
            <ul className="cut-br divide-y divide-line bg-white px-4">
              {items.map((c) => (
                <CompetitionRow key={c.id} c={c} athleteId={isCoach ? Number(pupil) || null : null}
                                pupilDisciplines={isCoach ? activePupils.filter((p) => p.athlete_id === Number(pupil)).map((p) => p.discipline_id) : null}
                                onChange={list.reload} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function CompetitionRow({ c, athleteId, pupilDisciplines, onChange }: {
  c: Competition; athleteId: number | null; pupilDisciplines: number[] | null; onChange: () => void;
}) {
  const { me } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const st = COMPETITION_STATUS[c.status];
  const isCoach = me?.active_role === "coach";
  const deadlinePassed = c.registration_deadline !== null && new Date(c.registration_deadline + "T23:59:59") < new Date();
  const applied = c.my_application_status && c.my_application_status !== "withdrawn";
  const canApply = c.status === "registration_open" && !deadlinePassed && c.eligible === true && !applied &&
    (!isCoach || (athleteId !== null && pupilDisciplines!.includes(c.discipline.id)));

  const apply = async () => {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/competitions/${c.id}/applications`, { method: "POST", json: isCoach ? { athlete_id: athleteId } : {} });
      onChange();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <li className="flex gap-4 py-5">
      <DateBlock start={c.start_date} end={c.end_date} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          {applied && <Badge tone={APPLICATION_STATUS[c.my_application_status!].tone}>Заявка: {APPLICATION_STATUS[c.my_application_status!].label.toLowerCase()}</Badge>}
        </div>
        <h3 className="mt-2 font-sans text-base font-semibold">{c.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">
          {c.discipline.name}, {c.age_group.name.toLowerCase()}. {LEVEL[c.level]}, {FORMAT[c.format].toLowerCase()}
          {c.format_details ? ` (${c.format_details.toLowerCase()})` : ""}.
        </p>
        {c.registration_deadline && c.status === "registration_open" && (
          <p className={`mt-1 text-sm ${deadlinePassed ? "text-danger" : "text-ink-soft"}`}>Приём заявок до {fmtDate(c.registration_deadline)}</p>
        )}
        {c.eligible === false && c.status === "registration_open" && <p className="mt-1 text-sm text-signal">{c.eligibility_note}</p>}
        <ErrorBox message={error} />
        <div className="mt-3 flex flex-wrap gap-2">
          {canApply && <button className="btn-primary btn-sm" disabled={busy} onClick={apply}>{isCoach ? "Подать заявку за спортсмена" : "Подать заявку"}</button>}
          {c.has_regulation && <a className="btn-secondary btn-sm" href={`/api/competitions/${c.id}/regulation`}>Положение</a>}
          {c.status === "completed" && <Link className="btn-secondary btn-sm" to={`/protocols/${c.id}`}>Протокол</Link>}
        </div>
      </div>
    </li>
  );
}

export function CompetitionLink() {
  const { id } = useParams();
  const { me } = useAuth();
  const comp = useApi<Competition>(`/api/competitions/${id}`);
  if (me?.active_role === "admin" || me?.active_role === "ministry") return <Navigate to={`/admin/competitions/${id}`} replace />;
  if (comp.error) return <ErrorBox message={comp.error} />;
  if (!comp.data) return <Loading />;
  return (
    <>
      <PageHeader title={comp.data.title} back={{ to: "/calendar", label: "Календарь" }} />
      <ul className="border-y border-line"><CompetitionRow c={comp.data} athleteId={null} pupilDisciplines={null} onChange={comp.reload} /></ul>
    </>
  );
}
