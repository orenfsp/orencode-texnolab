import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import { Badge, Empty, Loading, PageHeader, Section, Table } from "../../components/ui";
import { useApi } from "../../hooks";
import { fmtDate, STAGE, STAGE_SHORT } from "../../labels";

interface PathData {
  full_name: string;
  training_stage: string | null;
  antidoping_done: boolean;
  disciplines: {
    discipline: string; current_rank: string | null; valid_until: string | null; next_rank: string | null; requirements: string[];
    competitions: { id: number; title: string; start_date: string; level: string; eligible: boolean; note: string | null; can_reach_next: boolean }[];
  }[];
}

export interface Norms {
  stage: string | null; next_stage: string | null; ready: boolean;
  requirements: { standard: { name: string; unit: string; threshold: number; direction: string; kind: string }; value: number | null; passed: boolean; taken_on: string | null }[];
  history: { standard: string; value: number; unit: string; passed: boolean; taken_on: string }[];
  attestations: { from_stage: string | null; to_stage: string; decided_on: string; comment: string | null }[];
}

export function NormsBlock({ data }: { data: Norms }) {
  return (
    <>
      <p className="mb-4 text-sm text-ink-soft">
        {data.stage ? <>Сейчас: {STAGE[data.stage].toLowerCase()}.</> : "Этап подготовки не задан - спортсмен не зачислен в группу."}
        {data.next_stage && (data.ready ? <> Все нормативы этапа выполнены - можно переводить на этап {STAGE_SHORT[data.next_stage]}.</> : <> Для перевода на этап {STAGE_SHORT[data.next_stage]} нужно выполнить все нормативы ниже.</>)}
      </p>
      {data.requirements.length > 0 && (
        <Table head={<><th>Норматив</th><th>Порог</th><th>Результат</th><th /></>}>
          {data.requirements.map((r, i) => (
            <tr key={i}>
              <td>{r.standard.name}<div className="text-xs text-ink-muted">{r.standard.kind === "general" ? "общая физическая подготовка" : "специальная подготовка"}</div></td>
              <td className="num whitespace-nowrap text-sm">{r.standard.direction === "higher_better" ? "не меньше" : "не больше"} {r.standard.threshold} {r.standard.unit}</td>
              <td className="num text-sm">{r.value !== null ? `${r.value} ${r.standard.unit}` : "не сдавал"}{r.taken_on && <div className="font-sans text-xs text-ink-muted">{fmtDate(r.taken_on)}</div>}</td>
              <td>{r.value === null ? <Badge>Не сдан</Badge> : r.passed ? <Badge tone="green">Выполнен</Badge> : <Badge tone="rose">Не выполнен</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
      {data.attestations.length > 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          Аттестации: {data.attestations.map((a) => `${fmtDate(a.decided_on)} - перевод на ${STAGE_SHORT[a.to_stage]}`).join("; ")}.
        </p>
      )}
    </>
  );
}

export default function Path() {
  const { me } = useAuth();
  const { data } = useApi<PathData>("/api/me/path");
  const norms = useApi<Norms>(me ? `/api/athletes/${me.id}/norms` : null);
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title="Мой путь в спорте" lead="Что у вас есть сейчас, какой разряд следующий и где его можно выполнить." />
      {!data.antidoping_done && (
        <div className="mb-8 rounded-xl bg-signal/10 px-4 py-3 text-sm font-semibold text-signal">
          Вы ещё не отметили прохождение онлайн-курса РУСАДА. Это обязательно для всех спортсменов: <Link to="/profile">отметить в профиле</Link>.
        </div>
      )}
      {data.disciplines.length === 0 && <Empty>В профиле не указаны дисциплины.</Empty>}
      {data.disciplines.map((d) => (
        <Section key={d.discipline} title={d.discipline}>
          <ol className="grid gap-6 md:grid-cols-3">
            <li className="border-t-2 border-ink pt-3">
              <div className="text-sm text-ink-soft">Сейчас</div>
              <div className="mt-1 text-lg font-extrabold text-plum">{d.current_rank ?? "Без разряда"}</div>
              {d.valid_until && <div className="text-sm text-ink-soft">до {fmtDate(d.valid_until)}</div>}
            </li>
            <li className="border-t-2 border-fed pt-3">
              <div className="text-sm text-ink-soft">Следующая цель</div>
              <div className="mt-1 text-lg font-extrabold text-plum">{d.next_rank ?? "Высшая ступень достигнута"}</div>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">{d.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
            </li>
            <li className="border-t-2 border-line pt-3">
              <div className="text-sm text-ink-soft">Где выполнить</div>
              {d.competitions.length === 0 ? <p className="mt-1 text-sm text-ink-soft">Подходящих соревнований в календаре пока нет.</p> : (
                <ul className="mt-1 space-y-2 text-sm">
                  {d.competitions.map((c) => (
                    <li key={c.id}>
                      <Link to={`/competitions/${c.id}`} className="font-medium">{c.title}</Link>
                      <div className="text-ink-soft">{fmtDate(c.start_date)}, {c.level.toLowerCase()}</div>
                      {!c.eligible && <div className="text-signal">{c.note}</div>}
                      {c.eligible && c.can_reach_next && <div className="text-ok">Здесь можно выполнить {d.next_rank?.toLowerCase()}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ol>
        </Section>
      ))}
      <Section title="Этап подготовки и нормативы">
        {norms.data ? <NormsBlock data={norms.data} /> : <Loading />}
      </Section>
      <p className="text-sm text-ink-soft">Что такое разряды, ЕВСК и этапы подготовки - в <Link to="/guide">справочнике понятий</Link>.</p>
    </>
  );
}
