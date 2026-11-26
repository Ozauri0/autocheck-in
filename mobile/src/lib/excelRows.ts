// Construcción pura de filas y del libro Excel (sin acceso a archivos).
import * as XLSX from 'xlsx';
import { parseQr } from './qr';
import type { LocalRecord } from './types';

export const SHEET_NAME = 'Registros';
export const COLUMNS = [
  'Fecha',
  'Hora',
  'Sesión',
  'Sala',
  'Nombre',
  'RUT',
  'Email',
  'Extra',
  'Dispositivo',
  'Estado envío',
  'Raw',
  'ClientId',
] as const;

export type Row = Record<(typeof COLUMNS)[number], string>;

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha y hora en la zona horaria del dispositivo. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function excelStatus(r: LocalRecord): string {
  if (r.status === 'error') return `Error: ${r.error ?? 'desconocido'}`;
  const base = r.status === 'sent' ? 'Enviado' : 'Pendiente';
  return r.duplicate ? `${base} (duplicado)` : base;
}

export function buildRow(r: LocalRecord): Row {
  const a = parseQr(r.raw);
  return {
    Fecha: formatDate(r.scannedAt),
    Hora: formatTime(r.scannedAt),
    Sesión: r.sessionName,
    Sala: r.room,
    Nombre: a.name,
    RUT: a.rut,
    Email: a.email,
    Extra: a.extra.join(' | '),
    Dispositivo: r.deviceName,
    'Estado envío': excelStatus(r),
    Raw: r.raw,
    ClientId: r.clientId,
  };
}

/** Reemplaza las filas con el mismo ClientId y agrega al final las nuevas. */
export function upsertRows(rows: Row[], records: LocalRecord[]): Row[] {
  const result = [...rows];
  const index = new Map(result.map((row, i) => [row.ClientId, i]));
  for (const record of records) {
    const row = buildRow(record);
    const i = index.get(row.ClientId);
    if (i === undefined) index.set(row.ClientId, result.push(row) - 1);
    else result[i] = row;
  }
  return result;
}

export function rowsFromBase64(base64: string): Row[] {
  const book = XLSX.read(base64, { type: 'base64' });
  const sheet = book.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`El archivo no tiene la hoja ${SHEET_NAME}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' });
}

export function rowsToBase64(rows: Row[]): string {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNS] });
  sheet['!cols'] = [12, 10, 28, 14, 28, 14, 30, 20, 18, 22, 40, 38].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, SHEET_NAME);
  return XLSX.write(book, { type: 'base64', bookType: 'xlsx' });
}

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return slug || 'evento';
}
