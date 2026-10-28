import { Link } from "react-router-dom";
import { Loading } from "../../components/ui";
import { useApi } from "../../hooks";
import { fmtDate } from "../../labels";

interface Overview {
  disciplines: { id: number; code: string; name: string; about: string }[];
  organizations: { id: number; name: string; municipality: string; address: string | null; disciplines: string[] }[];
  upcoming: { id: number; title: string; discipline: string; start_date: string; registration_deadline: string | null; age_group: string }[];
}

export default function Start() {
  const { data } = useApi<Overview>("/api/public/overview");
  if (!data) return <Loading />;
  return (
    <article className="max-w-4xl">
      <h1 className="hyphens-auto text-xl font-bold [overflow-wrap:anywhere] sm:text-3xl">Спортивное программирование в Оренбургской области</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">
        Это официальный вид спорта: соревнования, разряды и сборная, как в лёгкой атлетике. Только вместо стадиона - задачи,
        код и роботы. Начать можно со школы.
      </p>

      <h2 className="mt-12 text-xl font-bold">Шесть дисциплин</h2>
      <dl className="mt-4 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {data.disciplines.map((d) => (
          <div key={d.id}>
            <dt className="font-semibold">{d.name}</dt>
            <dd className="mt-1 text-sm text-ink-soft">{d.about}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-xl font-bold">С чего начать</h2>
      <ol className="mt-4 space-y-4">
        {[
          ["Выберите дисциплину", "Посмотрите описания выше. Для старта чаще всего выбирают алгоритмическое программирование."],
          ["Найдите, где заниматься", "Организации ниже ведут спортивную подготовку с лицензией: группы по этапам, тренеры, учебный журнал."],
          ["Зарегистрируйтесь на платформе", "Аккаунт нужен для заявок на соревнования. Если вам нет 18, понадобится согласие родителя."],
          ["Подайте заявку на первое соревнование", "Платформа сама покажет, куда вы проходите по возрасту."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-ink text-sm font-bold text-white">{i + 1}</span>
            <div><div className="font-semibold">{t}</div><div className="text-sm text-ink-soft">{d}</div></div>
          </li>
        ))}
      </ol>
      <Link to="/register" className="btn-primary mt-6 text-white hover:text-white">Зарегистрироваться</Link>

      <h2 className="mt-12 text-xl font-bold">Где заниматься</h2>
      <ul className="mt-4 cut-br divide-y divide-line bg-white px-4">
        {data.organizations.map((o) => (
          <li key={o.id} className="py-3">
            <div className="font-medium">{o.name}</div>
            <div className="text-sm text-ink-soft">{o.address ?? o.municipality}</div>
            <div className="mt-1 text-sm text-ink-muted">{o.disciplines.join(", ")}</div>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-xl font-bold">Ближайшие соревнования</h2>
      <ul className="mt-4 cut-br divide-y divide-line bg-white px-4">
        {data.upcoming.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
            <span className="num w-24 shrink-0 text-sm font-bold">{fmtDate(c.start_date)}</span>
            <span className="flex-1">
              <span className="font-medium">{c.title}</span>
              <span className="block text-sm text-ink-soft">{c.age_group}{c.registration_deadline ? `, заявки до ${fmtDate(c.registration_deadline)}` : ""}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-sm text-ink-soft">Непонятные слова - разряд, первенство, РУСАДА - объяснены в <Link to="/guide">справочнике понятий</Link>.</p>
    </article>
  );
}
