import { postCheckins } from './api';
import { toPayload } from './records';
import type { CheckinResult, LocalRecord, ServerConfig } from './types';

export const BATCH_SIZE = 100;
export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS = 300_000;

export interface SyncDeps {
  getConfig: () => ServerConfig;
  getRecords: () => LocalRecord[];
  /** Persiste los resultados del servidor. */
  applyResults: (results: CheckinResult[]) => Promise<void>;
  /** Informa si el servidor respondió (para el indicador de conexión). */
  onReachability?: (ok: boolean) => void;
}

export interface SyncSummary {
  sent: number;
  failed: number;
  /** Error de red o HTTP: lo no enviado queda pendiente. */
  error?: string;
}

export function createSyncer(deps: SyncDeps) {
  // clientIds que se están enviando, para no mandar el mismo en paralelo.
  const inFlight = new Map<string, Promise<CheckinResult[]>>();
  let running: Promise<SyncSummary> | null = null;

  function send(batch: LocalRecord[]): Promise<CheckinResult[]> {
    const promise = (async () => {
      try {
        const results = await postCheckins(deps.getConfig(), batch.map(toPayload));
        deps.onReachability?.(true);
        await deps.applyResults(results);
        return results;
      } catch (e) {
        deps.onReachability?.((e as { status?: number }).status !== undefined);
        throw e;
      } finally {
        batch.forEach((r) => inFlight.delete(r.clientId));
      }
    })();
    batch.forEach((r) => inFlight.set(r.clientId, promise));
    return promise;
  }

  /** Envío inmediato de un escaneo. Lanza si no hay conexión (queda pendiente). */
  async function sendOne(record: LocalRecord): Promise<CheckinResult | undefined> {
    const results = await (inFlight.get(record.clientId) ?? send([record]));
    return results.find((r) => r.clientId === record.clientId);
  }

  async function run(): Promise<SyncSummary> {
    const summary: SyncSummary = { sent: 0, failed: 0 };
    // Cada registro se intenta una sola vez por pasada: nada de bucles.
    const queue = deps
      .getRecords()
      .filter((r) => r.status === 'pending' && !inFlight.has(r.clientId));
    try {
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batch = queue.slice(i, i + BATCH_SIZE).filter((r) => !inFlight.has(r.clientId));
        if (!batch.length) continue;
        for (const result of await send(batch)) {
          if (result.status === 'error') summary.failed++;
          else summary.sent++;
        }
      }
    } catch (e) {
      summary.error = (e as Error).message;
    }
    return summary;
  }

  /** Envía todos los pendientes. Llamadas simultáneas comparten la pasada en curso. */
  function syncPending(): Promise<SyncSummary> {
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  return { sendOne, syncPending };
}

export function nextDelay(current: number, failed: boolean): number {
  return failed ? Math.min(current * 2, RETRY_MAX_MS) : RETRY_BASE_MS;
}
