import type { CheckinPayload, CheckinResult, EventItem, ServerConfig } from './types';

export const TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(
    message: string,
    /** Status HTTP; undefined si no hubo respuesta (red o timeout). */
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Acepta "192.168.1.10:8080", "http://host:8080/" o incluso con "/api/v1". */
export function baseUrl(serverUrl: string): string {
  let url = serverUrl.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  if (!url) throw new ApiError('Servidor no configurado (ver Ajustes)');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return `${url}/api/v1`;
}

async function request<T>(config: ServerConfig, path: string, body?: unknown): Promise<T> {
  const url = baseUrl(config.serverUrl) + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'X-Device-Key': config.deviceKey,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const message =
        res.status === 401
          ? 'Clave de dispositivo inválida'
          : (data?.error ?? `Error del servidor (${res.status})`);
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      controller.signal.aborted ? 'El servidor no respondió a tiempo' : 'Sin conexión con el servidor',
    );
  } finally {
    clearTimeout(timer);
  }
}

export const getHealth = (config: ServerConfig) => request<{ status: string }>(config, '/health');

export async function getDeviceEvents(config: ServerConfig): Promise<EventItem[]> {
  const events = await request<EventItem[] | null>(config, '/device/events');
  return (events ?? []).map((e) => ({ ...e, sessions: e.sessions ?? [] }));
}

export async function postCheckins(
  config: ServerConfig,
  checkins: CheckinPayload[],
): Promise<CheckinResult[]> {
  const data = await request<{ results: CheckinResult[] }>(config, '/device/checkins', { checkins });
  if (!Array.isArray(data?.results)) throw new ApiError('Respuesta inválida del servidor');
  return data.results;
}
