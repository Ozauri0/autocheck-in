// Eventos activos, con caché para funcionar sin internet.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceEvents } from './api';
import { reachableStore } from './connection';
import { settingsStore } from './settings';
import { createStore } from './store';
import type { EventItem } from './types';

const KEY = 'eventsCache';

export const eventsStore = createStore<{
  events: EventItem[];
  fromCache: boolean;
  loading: boolean;
  error?: string;
}>({ events: [], fromCache: false, loading: false });

export async function loadEventsCache(): Promise<void> {
  const cached = await AsyncStorage.getItem(KEY);
  if (cached) eventsStore.set({ ...eventsStore.get(), events: JSON.parse(cached), fromCache: true });
}

export async function refreshEvents(): Promise<void> {
  eventsStore.set({ ...eventsStore.get(), loading: true });
  try {
    const events = await getDeviceEvents(settingsStore.get());
    await AsyncStorage.setItem(KEY, JSON.stringify(events));
    reachableStore.set(true);
    eventsStore.set({ events, fromCache: false, loading: false });
  } catch (e) {
    const { status, message } = e as { status?: number; message: string };
    reachableStore.set(status !== undefined);
    const { events } = eventsStore.get();
    eventsStore.set({ events, fromCache: events.length > 0, loading: false, error: message });
  }
}
