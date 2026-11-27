import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { createStore } from './store';
import type { Settings } from './types';

const KEY = 'settings';

export const settingsStore = createStore<Settings>({
  serverUrl: '',
  deviceKey: '',
  deviceName: 'Tablet',
  deviceId: '',
  camera: 'front',
});

export async function loadSettings(): Promise<void> {
  const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
  // Ajuste retirado: la tarjeta dura 2 s fijos. Se descarta el valor guardado (p. ej. 4).
  delete saved.cardSeconds;
  const settings: Settings = { ...settingsStore.get(), ...saved };
  if (!settings.deviceId) {
    settings.deviceId = randomUUID();
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  }
  settingsStore.set(settings);
}

export async function saveSettings(changes: Partial<Settings>): Promise<void> {
  const next = { ...settingsStore.get(), ...changes };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  settingsStore.set(next);
}
