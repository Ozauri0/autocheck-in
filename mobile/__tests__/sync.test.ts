import { applyResult, isLocalDuplicate } from '../src/lib/records';
import { createSyncer, nextDelay, RETRY_BASE_MS, RETRY_MAX_MS } from '../src/lib/sync';
import type { CheckinResult, LocalRecord } from '../src/lib/types';

const record = (clientId: string, extra: Partial<LocalRecord> = {}): LocalRecord => ({
  clientId,
  eventId: 'e1',
  sessionId: 's1',
  deviceId: 'd1',
  deviceName: 'Tablet',
  raw: `Ana|${clientId}|a@uct.cl`,
  scannedAt: '2026-11-25T12:00:00.000Z',
  eventName: 'Evento',
  sessionName: 'Sesión',
  room: 'A1',
  status: 'pending',
  duplicate: false,
  ...extra,
});

function setup(initial: LocalRecord[]) {
  let records = initial;
  const syncer = createSyncer({
    getConfig: () => ({ serverUrl: '10.0.0.1:8080', deviceKey: 'clave' }),
    getRecords: () => records,
    applyResults: async (results) => {
      records = records.map((r) => {
        const result = results.find((x) => x.clientId === r.clientId);
        return result ? applyResult(r, result) : r;
      });
    },
  });
  return { syncer, get: () => records };
}

const respond = (status: number, body: unknown) =>
  ({ ok: status < 300, status, json: async () => body }) as Response;

/** Responde a cada lote con el status que indique `statusOf`. */
const server = (statusOf: (id: string) => CheckinResult['status']) =>
  jest.fn(async (_url: string, init: RequestInit) => {
    const { checkins } = JSON.parse(init.body as string);
    return respond(200, {
      results: checkins.map(({ clientId }: { clientId: string }) => ({
        clientId,
        status: statusOf(clientId),
        ...(statusOf(clientId) === 'error' ? { message: 'sesión inexistente' } : {}),
      })),
    });
  });

const useFetch = (mock: jest.Mock) => {
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
};

it('marca cada registro según su resultado y no reintenta los errores', async () => {
  const fetchMock = useFetch(server((id) => id as CheckinResult['status']));
  const { syncer, get } = setup(['created', 'duplicate', 'exists', 'error'].map((id) => record(id)));

  expect(await syncer.syncPending()).toEqual({ sent: 3, failed: 1 });
  expect(get().map((r) => [r.status, r.duplicate])).toEqual([
    ['sent', false],
    ['sent', true],
    ['sent', false],
    ['error', false],
  ]);
  expect(get()[3].error).toBe('sesión inexistente');

  await syncer.syncPending();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('envía URL, clave y solo los campos del contrato', async () => {
  const fetchMock = useFetch(server(() => 'created'));
  await setup([record('a')]).syncer.syncPending();

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://10.0.0.1:8080/api/v1/device/checkins');
  expect((init.headers as Record<string, string>)['X-Device-Key']).toBe('clave');
  expect(Object.keys(JSON.parse(init.body as string).checkins[0]).sort()).toEqual(
    ['clientId', 'deviceId', 'deviceName', 'eventId', 'raw', 'scannedAt', 'sessionId'],
  );
});

it('un error de red deja los registros pendientes', async () => {
  useFetch(jest.fn().mockRejectedValue(new TypeError('Network request failed')));
  const { syncer, get } = setup([record('a'), record('b')]);

  const summary = await syncer.syncPending();
  expect(summary.error).toBe('Sin conexión con el servidor');
  expect(get().every((r) => r.status === 'pending')).toBe(true);
});

it('un 401 deja pendiente e informa la clave inválida', async () => {
  useFetch(jest.fn().mockResolvedValue(respond(401, { error: 'unauthorized' })));
  const { syncer, get } = setup([record('a')]);

  expect((await syncer.syncPending()).error).toBe('Clave de dispositivo inválida');
  expect(get()[0].status).toBe('pending');
});

it('envía en lotes de máximo 100', async () => {
  const fetchMock = useFetch(server(() => 'created'));
  const { syncer, get } = setup(Array.from({ length: 250 }, (_, i) => record(`id${i}`)));

  await syncer.syncPending();
  expect(
    fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string).checkins.length),
  ).toEqual([100, 100, 50]);
  expect(get().every((r) => r.status === 'sent')).toBe(true);
});

it('no manda dos veces en paralelo el mismo clientId', async () => {
  const fetchMock = useFetch(server(() => 'duplicate'));
  const { syncer } = setup([record('a')]);

  const [one] = await Promise.all([syncer.sendOne(record('a')), syncer.syncPending()]);
  expect(one?.status).toBe('duplicate');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('detecta duplicados locales por sesión y attendeeKey', () => {
  const records = [record('a', { raw: 'Ana|1.234-5|a@uct.cl' })];
  expect(isLocalDuplicate(records, 's1', 'Ana P|12345|x@uct.cl')).toBe(true);
  expect(isLocalDuplicate(records, 's2', 'Ana|12345')).toBe(false);
});

it('duplica la espera tras fallar, con tope, y la reinicia al tener éxito', () => {
  expect(nextDelay(RETRY_BASE_MS, true)).toBe(RETRY_BASE_MS * 2);
  expect(nextDelay(RETRY_MAX_MS, true)).toBe(RETRY_MAX_MS);
  expect(nextDelay(RETRY_MAX_MS, false)).toBe(RETRY_BASE_MS);
});
