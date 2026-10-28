import { useState } from "react";
import { api } from "../../api";
import { Dialog, Field, Loading, PageHeader, Select, Table, useAction } from "../../components/ui";
import { useApi, useDictionaries } from "../../hooks";
import { STAGE, STAGE_SHORT } from "../../labels";

interface Standard { id: number; name: string; kind: string; stage: string; discipline_id: number | null; discipline: string; gender: string | null; threshold: number; unit: string; direction: string }
const EMPTY = { name: "", kind: "general", stage: "np", discipline_id: "", gender: "", threshold: "", unit: "", direction: "higher_better" };

export default function Norms() {
  const dicts = useDictionaries();
  const list = useApi<Standard[]>("/api/norms/standards");
  const [edit, setEdit] = useState<Standard | "new" | null>(null);
  const [f, setF] = useState(EMPTY);
  const { busy, run, feedback } = useAction();
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const open = (s: Standard | "new") => {
    setEdit(s);
    setF(s === "new" ? EMPTY : { ...s, discipline_id: String(s.discipline_id ?? ""), gender: s.gender ?? "", threshold: String(s.threshold) });
  };
  const save = () => run(async () => {
    const body = { ...f, discipline_id: f.discipline_id ? Number(f.discipline_id) : null, gender: f.gender || null, threshold: Number(f.threshold) };
    if (edit === "new") await api("/api/norms/standards", { method: "POST", json: body });
    else await api(`/api/norms/standards/${(edit as Standard).id}`, { method: "PUT", json: body });
    setEdit(null);
    list.reload();
  }, "Норматив сохранён");

  return (
    <>
      <PageHeader title="Нормативы ФССП" lead="Нормативы общей и специальной физической подготовки по этапам. Тренер вносит результаты сдачи, платформа сама сравнивает их с порогом."
                  actions={<button className="btn-primary" onClick={() => open("new")}>Добавить норматив</button>} />
      {feedback}
      {!list.data ? <Loading /> : (
        <Table head={<><th>Этап</th><th>Норматив</th><th>Для кого</th><th>Порог</th><th /></>}>
          {list.data.map((s) => (
            <tr key={s.id}>
              <td title={STAGE[s.stage]}>{STAGE_SHORT[s.stage]}</td>
              <td>{s.name}<div className="text-xs text-ink-muted">{s.kind === "general" ? "общая физическая" : "специальная физическая"}</div></td>
              <td className="text-sm">{s.discipline}{s.gender ? `, ${s.gender === "male" ? "юноши" : "девушки"}` : ""}</td>
              <td className="num whitespace-nowrap text-sm">{s.direction === "higher_better" ? "≥" : "≤"} {s.threshold} {s.unit}</td>
              <td className="text-right"><button className="btn-quiet btn-sm" onClick={() => open(s)}>Изменить</button></td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "Новый норматив" : "Норматив"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Название" className="sm:col-span-2">{(id) => <input id={id} className="input" value={f.name} onChange={(e) => set("name")(e.target.value)} />}</Field>
          <Select label="Вид подготовки" value={f.kind} onChange={set("kind")} options={[["general", "Общая физическая"], ["special", "Специальная физическая"]]} />
          <Select label="Этап" value={f.stage} onChange={set("stage")} options={Object.entries(STAGE)} />
          <Select label="Дисциплина" value={f.discipline_id} onChange={set("discipline_id")} required={false} placeholder="Все дисциплины" options={dicts?.disciplines.map((d) => [d.id, d.name]) ?? []} />
          <Select label="Пол" value={f.gender} onChange={set("gender")} required={false} placeholder="Для всех" options={[["male", "Юноши"], ["female", "Девушки"]]} />
          <Select label="Лучше, когда результат" value={f.direction} onChange={set("direction")} options={[["higher_better", "больше порога"], ["lower_better", "меньше порога"]]} />
          <Field label="Порог">{(id) => <input id={id} type="number" step="0.1" className="input" value={f.threshold} onChange={(e) => set("threshold")(e.target.value)} />}</Field>
          <Field label="Единица">{(id) => <input id={id} className="input" placeholder="с, раз, зн/мин" value={f.unit} onChange={(e) => set("unit")(e.target.value)} />}</Field>
          <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || !f.name || !f.threshold || !f.unit} onClick={save}>Сохранить</button></div>
        </div>
      </Dialog>
    </>
  );
}
