import "server-only";
import { getToken } from "./session";
import type {
  Admin,
  CheckinInput,
  CheckinPage,
  CheckinResult,
  Event,
  EventDetail,
  EventInput,
  EventSummary,
  Session,
  SessionInput,
  Stats,
} from "./types";

export type * from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiUrl(path: string): string {
  const base = (process.env.API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
  return `${base}/api/v1${path}`;
}

/** Evita que un id manipulado cambie la ruta llamada en la API. */
function seg(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new ApiError(404, "Recurso no encontrado");
  return id;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  /** Los streams grandes (export) no usan límite de tiempo. */
  timeout?: boolean;
}

/** Petición cruda a la API; lanza ApiError ante cualquier respuesta no exitosa. */
async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { method = "GET", body, auth = true, timeout = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getToken();
    if (!token) throw new ApiError(401, "Sesión expirada");
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: timeout ? AbortSignal.timeout(15_000) : undefined,
    });
  } catch {
    throw new ApiError(503, "No fue posible conectar con el servidor. Intente nuevamente.");
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? `Error del servidor (${res.status})`);
  }
  return res;
}

async function json<T>(path: string, opts?: RequestOptions): Promise<T> {
  const res = await request(path, opts);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    json<{ token: string; admin: Admin }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  me: () => json<Admin>("/auth/me"),

  // Endpoints de dispositivo: aceptan el Bearer del admin (escáner web).
  deviceEvents: async () => (await json<EventDetail[] | null>("/device/events")) ?? [],
  deviceCheckins: (checkins: CheckinInput[]) =>
    json<{ results: CheckinResult[] }>("/device/checkins", { method: "POST", body: { checkins } }),

  listEvents: async (includeInactive: boolean) =>
    (await json<EventSummary[] | null>(`/events?includeInactive=${includeInactive}`)) ?? [],
  getEvent: (id: string) => json<EventDetail>(`/events/${seg(id)}`),
  createEvent: (input: EventInput) => json<Event>("/events", { method: "POST", body: input }),
  updateEvent: (id: string, input: EventInput) =>
    json<Event>(`/events/${seg(id)}`, { method: "PUT", body: input }),
  setEventActive: (id: string, active: boolean) =>
    json<Event>(`/events/${seg(id)}/active`, { method: "PATCH", body: { active } }),
  deleteEvent: (id: string) => json<void>(`/events/${seg(id)}`, { method: "DELETE" }),

  createSession: (eventId: string, input: SessionInput) =>
    json<Session>(`/events/${seg(eventId)}/sessions`, { method: "POST", body: input }),
  updateSession: (id: string, input: SessionInput) =>
    json<Session>(`/sessions/${seg(id)}`, { method: "PUT", body: input }),
  deleteSession: (id: string) => json<void>(`/sessions/${seg(id)}`, { method: "DELETE" }),

  listCheckins: (
    eventId: string,
    f: { sessionId: string; q: string; includeDuplicates: boolean; page: number; limit: number },
  ) => {
    const params = new URLSearchParams({
      includeDuplicates: String(f.includeDuplicates),
      page: String(f.page),
      limit: String(f.limit),
    });
    if (f.sessionId) params.set("sessionId", f.sessionId);
    if (f.q) params.set("q", f.q);
    return json<CheckinPage>(`/events/${seg(eventId)}/checkins?${params}`);
  },
  stats: (eventId: string) => json<Stats>(`/events/${seg(eventId)}/stats`),
  exportXlsx: (eventId: string, sessionId: string) => {
    const query = sessionId ? `?${new URLSearchParams({ sessionId })}` : "";
    return request(`/events/${seg(eventId)}/export.xlsx${query}`, { timeout: false });
  },
};
