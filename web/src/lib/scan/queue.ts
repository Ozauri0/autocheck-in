// Cola persistente de escaneos y su envío al BFF (/api/scan). Idempotente por clientId.
import { attendeeKey } from "./qr";
import { read, uuid, write } from "./storage";
import type { CheckinInput, CheckinResult } from "@/lib/types";

const BATCH_SIZE = 100;
const SEND_TIMEOUT_MS = 20_000;

export interface QueueState {
  pending: number;
  /** Rechazados por el servidor: se conservan, pero no se reintentan. */
  rejected: number;
  needLogin: boolean;
  syncing: boolean;
  /** localStorage falló: lo pendiente se pierde si se cierra la página. */
  volatile: boolean;
}

export type SendResponse =
  | { kind: "sent"; results: CheckinResult[] }
  | { kind: "unauthorized" }
  | { kind: "failed" };

const pending = () => read<CheckinInput[]>("queue", []);
const rejected = () => read<CheckinInput[]>("rejected", []);

const flags = { needLogin: false, syncing: false, volatile: false };
const listeners = new Set<() => void>();
let snapshot: QueueState | null = null;

function changed() {
  snapshot = null;
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  // Otra pestaña modificó la cola.
  window.addEventListener("storage", changed);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", changed);
  };
}

export function getState(): QueueState {
  snapshot ??= { ...flags, pending: pending().length, rejected: rejected().length };
  return snapshot;
}

function save(key: string, records: CheckinInput[]) {
  flags.volatile = !write(key, records);
}

/** Guarda el escaneo antes de enviarlo. `repeated`: ya se leyó a esa persona en la sesión. */
export function enqueue(input: Omit<CheckinInput, "clientId" | "scannedAt">) {
  const record: CheckinInput = {
    ...input,
    clientId: uuid(),
    scannedAt: new Date().toISOString(),
  };
  save("queue", [...pending(), record]);

  const key = `${record.sessionId}|${attendeeKey(record.raw)}`;
  const seen = read<string[]>("seen", []);
  const repeated = seen.includes(key);
  if (!repeated) write("seen", [...seen, key].slice(-5000));
  changed();
  return { record, repeated };
}

export async function send(batch: CheckinInput[]): Promise<SendResponse> {
  let response: SendResponse = { kind: "failed" };
  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkins: batch }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.status === 401) response = { kind: "unauthorized" };
    else if (res.ok) {
      const { results } = (await res.json()) as { results: CheckinResult[] };
      response = { kind: "sent", results };
    }
  } catch {
    // Sin conexión: queda en la cola.
  }

  if (response.kind === "unauthorized") flags.needLogin = true;
  if (response.kind === "sent") {
    flags.needLogin = false;
    const status = new Map(response.results.map((r) => [r.clientId, r.status]));
    // Se relee la cola: pudo crecer mientras se enviaba.
    const queue = pending();
    const refused = queue.filter((r) => status.get(r.clientId) === "error");
    if (refused.length) save("rejected", [...rejected(), ...refused]);
    save(
      "queue",
      queue.filter((r) => !status.has(r.clientId)),
    );
  }
  changed();
  return response;
}

let running: Promise<void> | null = null;

async function run() {
  flags.syncing = true;
  changed();
  const queue = pending();
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const response = await send(queue.slice(i, i + BATCH_SIZE));
    if (response.kind !== "sent") break;
  }
  flags.syncing = false;
  changed();
}

/** Envía todo lo pendiente. Llamadas simultáneas comparten la pasada en curso. */
export function sync(): Promise<void> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}
