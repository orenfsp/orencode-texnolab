import type { Role } from "../../api";
import { Loading, PageHeader, Table } from "../../components/ui";
import { useApi } from "../../hooks";
import { ROLE_LABEL } from "../../labels";

interface Entry { id: number; at: string; user: string | null; role: Role | null; action: string; entity: string; entity_id: number | null; details: Record<string, unknown> | null }

const ACTION: Record<string, string> = {
  create: "создание", update: "изменение", delete: "удаление", status: "смена статуса", results: "ввод результатов",
  publish: "публикация", upload: "загрузка файла", register: "регистрация", assign: "присвоение", correction: "корректировка протокола",
  import: "импорт результатов", revoke: "отзыв", consent: "согласие ФСП ID", transfer: "перевод",
};

export default function Audit() {
  const { data } = useApi<Entry[]>("/api/admin/audit?limit=200");
  return (
    <>
      <PageHeader title="Журнал действий" lead="Кто, когда и что сделал: создание, изменение и удаление записей, смена статусов, ввод результатов." />
      {!data ? <Loading /> : (
        <Table head={<><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Подробности</th></>}>
          {data.map((e) => (
            <tr key={e.id}>
              <td className="num whitespace-nowrap text-xs">{new Date(e.at).toLocaleString("ru-RU")}</td>
              <td className="text-sm">{e.user ?? "система"}{e.role && <div className="text-xs text-ink-muted">{ROLE_LABEL[e.role]}</div>}</td>
              <td className="text-sm">{ACTION[e.action] ?? e.action}</td>
              <td className="text-sm">{e.entity}{e.entity_id ? ` № ${e.entity_id}` : ""}</td>
              <td className="max-w-xs truncate text-xs text-ink-soft" title={e.details ? JSON.stringify(e.details) : ""}>
                {e.details ? Object.entries(e.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("; ") : ""}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
