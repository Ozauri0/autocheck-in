import { randomUUID } from 'expo-crypto';
import { syncer } from './autosync';
import { networkStore } from './connection';
import { addRecord, loadRecords, recordsStore } from './db';
import { saveToExcel } from './excel';
import { isLocalDuplicate } from './records';
import { settingsStore } from './settings';
import type { EventItem, LocalRecord, Session } from './types';

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

/**
 * Envía de inmediato y resuelve con el resultado en cuanto el servidor responde.
 * No tiene límite de espera: quien muestra la tarjeta decide si todavía la puede actualizar.
 * Sin conexión (o si falla la petición) resuelve con el estado local: queda pendiente.
 */
export async function sendRecord(record: LocalRecord): Promise<Outcome> {
  const fallback: Outcome = record.duplicate ? { kind: 'duplicate' } : { kind: 'offline' };
  if (!networkStore.get()) return fallback;

  return syncer.sendOne(record).then(
    (result): Outcome => {
      if (result?.status === 'error') {
        return { kind: 'error', message: result.message ?? 'Rechazado por el servidor' };
      }
      if (!result) return fallback;
      return record.duplicate || result.status === 'duplicate' || result.duplicate === true
        ? { kind: 'duplicate' }
        : { kind: 'ok' };
    },
    () => fallback,
  );
}
