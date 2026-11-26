// Un Excel por evento en documentDirectory. Todas las escrituras pasan por el mismo mutex.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Row, rowsFromBase64, rowsToBase64, slugify, upsertRows } from './excelRows';
import { existingFile, writeAtomic } from './files';
import { createMutex } from './mutex';
import type { LocalRecord } from './types';

const NAMES_KEY = 'excelFiles';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const lock = createMutex();

/** Nombre estable por evento, aunque lo renombren o dos eventos se llamen igual. */
async function fileName(eventId: string, eventName: string): Promise<string> {
  const names: Record<string, string> = JSON.parse((await AsyncStorage.getItem(NAMES_KEY)) ?? '{}');
  if (!names[eventId]) {
    const base = `autocheckin_${slugify(eventName)}`;
    const taken = new Set(Object.values(names));
    let name = `${base}.xlsx`;
    for (let n = 2; taken.has(name); n++) name = `${base}_${n}.xlsx`;
    names[eventId] = name;
    await AsyncStorage.setItem(NAMES_KEY, JSON.stringify(names));
  }
  return names[eventId];
}

async function update(records: LocalRecord[]): Promise<string> {
  const { eventId, eventName } = records[0];
  const name = await fileName(eventId, eventName);
  const file = existingFile(name);
  let rows: Row[] = [];
  if (file) {
    try {
      rows = rowsFromBase64(await file.base64());
    } catch {
      // Archivo ilegible: se respalda; "Exportar" lo reconstruye completo.
      await new File(Paths.document, file.name).copy(
        new File(Paths.document, `corrupto-${Date.now()}-${name}`),
      );
    }
  }
  await writeAtomic(name, rowsToBase64(upsertRows(rows, records)), 'base64');
  return name;
}

/** Agrega o actualiza las filas de estos registros (pueden ser de varios eventos). */
export function saveToExcel(records: LocalRecord[]): Promise<void> {
  return lock(async () => {
    const byEvent = new Map<string, LocalRecord[]>();
    for (const r of records) byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
    for (const group of byEvent.values()) await update(group);
  });
}

export async function exportExcel(records: LocalRecord[]): Promise<void> {
  if (!records.length) throw new Error('No hay registros para exportar');
  // Se reconcilia con todos los registros por si alguna escritura anterior falló.
  const name = await lock(() => update(records));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite compartir');
  await Sharing.shareAsync(new File(Paths.document, name).uri, {
    mimeType: MIME,
    dialogTitle: 'Exportar Excel',
  });
}
