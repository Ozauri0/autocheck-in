// Sincronizador de la app: reintentos con backoff y al recuperar la conexión.
import NetInfo from '@react-native-community/netinfo';
import { networkStore, reachableStore } from './connection';
import { applyResults, recordsStore, requeueErrors } from './db';
import { saveToExcel } from './excel';
import { settingsStore } from './settings';
import { createSyncer, nextDelay, RETRY_BASE_MS, SyncSummary } from './sync';
import type { CheckinResult } from './types';

export const syncer = createSyncer({
  getConfig: settingsStore.get,
  getRecords: recordsStore.get,
  onReachability: (ok) => reachableStore.set(ok),
  applyResults: async (results: CheckinResult[]) => {
    await applyResults(results);
    const ids = new Set(results.map((r) => r.clientId));
    // Sin await: reescribir el Excel no debe demorar la respuesta en pantalla.
    saveToExcel(recordsStore.get().filter((r) => ids.has(r.clientId))).catch((e) =>
      console.warn('No se pudo actualizar el Excel', e),
    );
  },
});

let delay = RETRY_BASE_MS;
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

async function tick(): Promise<SyncSummary> {
  clearTimeout(timer);
  let summary: SyncSummary = { sent: 0, failed: 0 };
  try {
    summary = await syncer.syncPending();
  } catch (e) {
    summary.error = (e as Error).message;
  }
  delay = nextDelay(delay, !!summary.error);
  clearTimeout(timer);
  if (started) timer = setTimeout(tick, delay);
  return summary;
}

export async function syncNow(): Promise<SyncSummary> {
  await requeueErrors();
  delay = RETRY_BASE_MS;
  return tick();
}

export function startAutoSync(): () => void {
  started = true;
  const unsubscribe = NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false;
    const recovered = online && !networkStore.get();
    networkStore.set(online);
    if (recovered) {
      delay = RETRY_BASE_MS;
      tick();
    }
  });
  tick();
  return () => {
    started = false;
    clearTimeout(timer);
    unsubscribe();
  };
}
