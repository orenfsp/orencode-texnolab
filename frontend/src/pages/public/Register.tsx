import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, tokenStore, type TokenOut } from "../../api";
import { Field, Notice, Select } from "../../components/ui";
import { useDictionaries } from "../../hooks";

const ageOf = (iso: string) => {
  if (!iso) return null;
  const b = new Date(iso + "T00:00:00"), t = new Date();
  return t.getFullYear() - b.getFullYear() - (t < new Date(t.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
};

export default function Register() {
  const dicts = useDictionaries();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    email: "", password: "", last_name: "", first_name: "", middle_name: "", birth_date: "", gender: "",
    municipality_id: "", organization_id: "", start_year: String(new Date().getFullYear()),
    guardian_name: "", guardian_phone: "", consent_pd: false, guardian_consent: false,
  });
  const [disciplines, setDisciplines] = useState<number[]>([]);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF({ ...f, [k]: v });
  const age = ageOf(f.birth_date);
  const minor = age !== null && age < 18;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const t = await api<TokenOut>("/api/auth/register", {
        method: "POST",
        json: {
          ...f, middle_name: f.middle_name || null, municipality_id: Number(f.municipality_id),
          organization_id: f.organization_id ? Number(f.organization_id) : null, start_year: Number(f.start_year),
          discipline_ids: disciplines, guardian_name: minor ? f.guardian_name : null, guardian_phone: minor ? f.guardian_phone : null,
        },
      });
      tokenStore.set(t.access_token);
      navigate("/calendar");
      location.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!dicts) return null;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="hyphens-auto text-xl font-bold [overflow-wrap:anywhere] sm:text-3xl">Регистрация спортсмена</h1>
      <p className="mt-2 text-ink-soft">Тренеров и судей добавляет федерация. Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      <form onSubmit={submit} className="mt-8 grid gap-4 sm:grid-cols-2">
        <Field label="Фамилия">{(id) => <input id={id} className="input" required value={f.last_name} onChange={(e) => set("last_name")(e.target.value)} />}</Field>
        <Field label="Имя">{(id) => <input id={id} className="input" required value={f.first_name} onChange={(e) => set("first_name")(e.target.value)} />}</Field>
        <Field label="Отчество (если есть)">{(id) => <input id={id} className="input" value={f.middle_name} onChange={(e) => set("middle_name")(e.target.value)} />}</Field>
        <Field label="Дата рождения">{(id) => <input id={id} type="date" className="input" required value={f.birth_date} onChange={(e) => set("birth_date")(e.target.value)} />}</Field>
        <Select label="Пол" value={f.gender} onChange={set("gender")} options={[["male", "Мужской"], ["female", "Женский"]]} />
        <Select label="Муниципалитет" value={f.municipality_id} onChange={set("municipality_id")} options={dicts.municipalities.map((m) => [m.id, m.name])} />
        <Select label="Организация" value={f.organization_id} onChange={set("organization_id")} required={false} placeholder="Без организации"
                options={dicts.organizations.map((o) => [o.id, o.name])} />
        <Field label="Год начала занятий">{(id) => <input id={id} type="number" min={2000} max={new Date().getFullYear()} className="input" required value={f.start_year} onChange={(e) => set("start_year")(e.target.value)} />}</Field>
        <fieldset className="sm:col-span-2">
          <legend className="label">Дисциплины</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {dicts.disciplines.map((d) => (
              <label key={d.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={disciplines.includes(d.id)}
                       onChange={(e) => setDisciplines(e.target.checked ? [...disciplines, d.id] : disciplines.filter((x) => x !== d.id))} />
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>
        {minor && (
          <div className="grid gap-4 rounded-xl bg-signal/5 p-4 sm:col-span-2 sm:grid-cols-2">
            <p className="text-sm text-ink-soft sm:col-span-2">Спортсмену нет 18 лет: нужны данные и согласие законного представителя.</p>
            <Field label="ФИО законного представителя">{(id) => <input id={id} className="input" required value={f.guardian_name} onChange={(e) => set("guardian_name")(e.target.value)} />}</Field>
            <Field label="Телефон представителя">{(id) => <input id={id} className="input" type="tel" value={f.guardian_phone} onChange={(e) => set("guardian_phone")(e.target.value)} />}</Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-1" required checked={f.guardian_consent} onChange={(e) => set("guardian_consent")(e.target.checked)} />
              Законный представитель даёт согласие на обработку персональных данных несовершеннолетнего
            </label>
          </div>
        )}
        <Field label="Email">{(id) => <input id={id} type="email" className="input" required value={f.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" />}</Field>
        <Field label="Пароль" hint="Не короче 8 символов">{(id) => <input id={id} type="password" minLength={8} className="input" required value={f.password} onChange={(e) => set("password")(e.target.value)} autoComplete="new-password" />}</Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-1" required checked={f.consent_pd} onChange={(e) => set("consent_pd")(e.target.checked)} />
          Даю согласие на обработку персональных данных в соответствии с 152-ФЗ для учёта в реестре федерации
        </label>
        <div className="sm:col-span-2">
          {error && <Notice>{error}</Notice>}
          <button className="btn-primary" disabled={disciplines.length === 0}>Создать аккаунт</button>
          {disciplines.length === 0 && <p className="hint">Выберите хотя бы одну дисциплину.</p>}
        </div>
      </form>
    </div>
  );
}
