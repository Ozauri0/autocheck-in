// Operaciones puras sobre los registros locales.
import { attendeeKey } from './qr';
import type { CheckinPayload, CheckinResult, LocalRecord } from './types';

export function toPayload(r: LocalRecord): CheckinPayload {
  const { clientId, eventId, sessionId, deviceId, deviceName, raw, scannedAt } = r;
  return { clientId, eventId, sessionId, deviceId, deviceName, raw, scannedAt };
}

export function applyResult(record: LocalRecord, result: CheckinResult): LocalRecord {
  if (result.status === 'error') {
    // Un registro ya aceptado por el servidor no retrocede.
    if (record.status === 'sent') return record;
    return { ...record, status: 'error', error: result.message || 'Rechazado por el servidor' };
  }
  return {
    ...record,
    status: 'sent',
    duplicate: record.duplicate || result.status === 'duplicate' || result.duplicate === true,
    error: undefined,
  };
}

export function isLocalDuplicate(records: LocalRecord[], sessionId: string, raw: string): boolean {
  const key = attendeeKey(raw);
  return records.some(
    (r) => r.sessionId === sessionId && r.status !== 'error' && attendeeKey(r.raw) === key,
  );
}

export function statusLabel(r: LocalRecord): string {
  if (r.status === 'error') return 'Error';
  if (r.status === 'pending') return r.duplicate ? 'Pendiente (duplicado)' : 'Pendiente';
  return r.duplicate ? 'Duplicado' : 'Enviado';
}
