import { randomUUID } from 'expo-crypto';
import { syncer } from './autosync';
import { networkStore } from './connection';
import { addRecord, loadRecords, recordsStore } from './db';
import { saveToExcel } from './excel';
import { isLocalDuplicate } from './records';
import { settingsStore } from './settings';
import type { EventItem, LocalRecord, Session } from './types';

/** Tiempo que la tarjeta espera al servidor antes de darlo por "se enviará luego". */
const SEND_WAIT_MS = 2500;

export type Outcome =
  | { kind: 'sending' }
  | { kind: 'ok' }
  | { kind: 'duplicate' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

export async function createRecord(
  event: EventItem,
  session: Session,
  raw: string,
): Promise<{ record: LocalRecord; excelError?: string }> {
  await loadRecords();
  const { deviceId, deviceName } = settingsStore.get();
  const record: LocalRecord = {
    clientId: randomUUID(),
    eventId: event.id,
    sessionId: session.id,
    deviceId,
    deviceName,
    raw,
    scannedAt: new Date().toISOString(),
    eventName: event.name,
    sessionName: session.name,
    room: session.room ?? '',
    status: 'pending',
    duplicate: isLocalDuplicate(recordsStore.get(), session.id, raw),
  };
  // Primero a disco (cola y Excel); recién después se envía.
  await addRecord(record);
  try {
    await saveToExcel([record]);
  } catch (e) {
    return { record, excelError: (e as Error).message };
  }
  return { record };
}

/** Envía de inmediato. `onLate` avisa si el servidor responde después de la espera. */
export async function sendRecord(
  record: LocalRecord,
  onLate: (outcome: Outcome) => void,
): Promise<Outcome> {
  const fallback: Outcome = record.duplicate ? { kind: 'duplicate' } : { kind: 'offline' };
  if (!networkStore.get()) return fallback;

  const request: Promise<Outcome> = syncer.sendOne(record).then(
    (result): Outcome => {
      if (result?.status === 'error') {
        return { kind: 'error', message: result.message ?? 'Rechazado por el servidor' };
      }
      if (!result) return fallback;
      return record.duplicate || result.status === 'duplicate' ? { kind: 'duplicate' } : { kind: 'ok' };
    },
    () => fallback,
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SEND_WAIT_MS);
  });
  const first = await Promise.race([request, timeout]);
  clearTimeout(timer);
  if (first) return first;
  request.then(onLate);
  return fallback;
}
