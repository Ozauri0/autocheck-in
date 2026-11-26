import {
  buildRow,
  COLUMNS,
  rowsFromBase64,
  rowsToBase64,
  slugify,
  upsertRows,
} from '../src/lib/excelRows';
import type { LocalRecord } from '../src/lib/types';

const record: LocalRecord = {
  clientId: 'c1',
  eventId: 'e1',
  sessionId: 's1',
  deviceId: 'd1',
  deviceName: 'Tablet Sala 1',
  raw: '=Ana|013.816-K|a@uct.cl|x|y',
  // Hora local, para que el test no dependa de la zona horaria.
  scannedAt: new Date(2026, 10, 25, 9, 5, 7).toISOString(),
  eventName: 'Evento',
  sessionName: 'Apertura',
  room: 'A1',
  status: 'pending',
  duplicate: false,
};

it('construye la fila con todas las columnas', () => {
  const row = buildRow(record);
  expect(Object.keys(row)).toEqual([...COLUMNS]);
  expect(row).toMatchObject({
    Fecha: '25-11-2026',
    Hora: '09:05:07',
    Sesión: 'Apertura',
    Sala: 'A1',
    Nombre: '=Ana',
    RUT: '013.816-K',
    Email: 'a@uct.cl',
    Extra: 'x | y',
    Dispositivo: 'Tablet Sala 1',
    'Estado envío': 'Pendiente',
    ClientId: 'c1',
  });
});

it('agrega filas nuevas y actualiza el estado por ClientId', () => {
  const first = upsertRows([], [record]);
  const second = upsertRows(first, [
    { ...record, status: 'sent', duplicate: true },
    { ...record, clientId: 'c2', status: 'error', error: 'sesión inexistente' },
  ]);
  expect(second.map((r) => r['Estado envío'])).toEqual([
    'Enviado (duplicado)',
    'Error: sesión inexistente',
  ]);
});

it('sobrevive a escribir y releer el .xlsx', () => {
  const rows = upsertRows([], [record]);
  expect(rowsFromBase64(rowsToBase64(rows))).toEqual(rows);
});

it('genera nombres de archivo seguros', () => {
  expect(slugify('Encuentro de Ingeniería / ECAD 2026!')).toBe('encuentro-de-ingenieria-ecad-2026');
  expect(slugify('¡¡')).toBe('evento');
});
