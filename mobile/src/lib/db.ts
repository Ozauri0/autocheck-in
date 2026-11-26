// Registros locales (incluye la cola de pendientes: status === 'pending'), en un JSON persistente.
// Se usa un archivo y no AsyncStorage para no chocar con sus límites de tamaño en Android.
import { File, Paths } from 'expo-file-system';
import { existingFile, writeAtomic } from './files';
import { createMutex } from './mutex';
import { applyResult } from './records';
import { createStore } from './store';
import type { CheckinResult, LocalRecord } from './types';

const FILE = 'registros.json';
const lock = createMutex();

export const recordsStore = createStore<LocalRecord[]>([]);

let loading: Promise<void> | null = null;

export function loadRecords(): Promise<void> {
  loading ??= (async () => {
    const file = existingFile(FILE);
    if (!file) return;
    const text = await file.text();
    try {
      recordsStore.set(JSON.parse(text));
    } catch {
      // Se conserva una copia para recuperación manual antes de empezar de cero.
      await new File(Paths.document, file.name).copy(
        new File(Paths.document, `registros-corrupto-${Date.now()}.json`),
      );
    }
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

function mutate(change: (records: LocalRecord[]) => LocalRecord[]): Promise<void> {
  return lock(async () => {
    await loadRecords();
    const next = change(recordsStore.get());
    await writeAtomic(FILE, JSON.stringify(next), 'utf8');
    recordsStore.set(next);
  });
}

export const addRecord = (record: LocalRecord) => mutate((all) => [...all, record]);

export function applyResults(results: CheckinResult[]) {
  const byId = new Map(results.map((r) => [r.clientId, r]));
  return mutate((all) =>
    all.map((record) => {
      const result = byId.get(record.clientId);
      return result ? applyResult(record, result) : record;
    }),
  );
}

/** Vuelve a la cola los rechazados (solo por acción manual del operador). */
export const requeueErrors = () =>
  mutate((all) =>
    all.map((r) => (r.status === 'error' ? { ...r, status: 'pending', error: undefined } : r)),
  );
