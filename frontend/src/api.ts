export type Role = "admin" | "athlete" | "coach" | "judge" | "ministry";
export type CompetitionStatus = "draft" | "registration_open" | "registration_closed" | "completed" | "cancelled";
export type ApplicationStatus = "submitted" | "approved" | "rejected" | "withdrawn";

export interface DictItem { id: number; name: string; code?: string | null }
export interface AgeGroup { id: number; code: string; name: string; min_age: number; max_age: number | null }
export interface Dictionaries {
  disciplines: DictItem[];
  municipalities: DictItem[];
  organizations: DictItem[];
  competition_types: DictItem[];
  age_groups: AgeGroup[];
  sport_ranks: DictItem[];
  judge_categories: DictItem[];
  judge_positions: DictItem[];
}

export interface TokenOut { access_token: string; active_role: Role; roles: Role[] }
export interface Me { id: number; email: string; full_name: string; roles: Role[]; active_role: Role; birth_date: string | null }

export interface Competition {
  id: number;
  title: string;
  discipline: DictItem;
  type: DictItem;
  level: "regional" | "interregional" | "all_russian";
  rating_level: string;
  age_group: AgeGroup;
  format: "offline" | "online" | "mixed";
  format_details: string | null;
  venue: string | null;
  start_date: string;
  end_date: string;
  registration_deadline: string | null;
  status: CompetitionStatus;
  calendar_plan: "none" | "ekp" | "regional";
  calendar_plan_number: string | null;
  has_regulation: boolean;
  applications_count: number;
  my_application_status: ApplicationStatus | null;
  eligible: boolean | null;
  eligibility_note: string | null;
}

export interface Application {
  id: number;
  competition_id: number;
  competition_title: string;
  athlete_id: number;
  athlete_name: string;
  athlete_birth_year: number | null;
  organization: string | null;
  submitted_by_name: string;
  submitted_as: Role;
  status: ApplicationStatus;
  comment: string | null;
  created_at: string;
}

export interface ProtocolRow {
  place: number | null;
  athlete_id: number;
  full_name: string;
  birth_year: number | null;
  municipality: string | null;
  organization: string | null;
  rank: string | null;
  score: number | null;
  note: string | null;
  result_id: number | null;
  evsk_hint: string | null;
}
export interface Protocol {
  competition: Competition;
  number: string | null;
  published_at: string | null;
  rows: ProtocolRow[];
  judges: { full_name: string; position: string; category: string | null }[];
}

export interface HistoryItem {
  result_id: number;
  evsk_hint: string | null;
  competition_id: number;
  competition_title: string;
  start_date: string;
  level: Competition["level"];
  discipline: string;
  place: number | null;
  score: number | null;
  participants: number;
  protocol_url: string;
}

export interface Notification { id: number; title: string; body: string; link: string | null; created_at: string; read_at: string | null }

const TOKEN_KEY = "fsp56.token";

let memoryToken: string | null = null;
export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
  },
  set(token: string | null) {
    memoryToken = token;
    try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => String(d.msg ?? d).replace(/^Value error, /, "")).join("; ");
  return `Ошибка ${status}`;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}

export async function download(path: string, filename: string) {
  const token = tokenStore.get();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "Не удалось скачать файл");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const dl = (path: string, name: string) => () => download(path, name).catch((e) => alert((e as Error).message));

export function postForm<T>(path: string, form: FormData): Promise<T> {
  return api<T>(path, { method: "POST", body: form });
}
