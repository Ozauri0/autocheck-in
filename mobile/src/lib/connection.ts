import { createStore } from './store';

/** Hay red en el dispositivo (NetInfo). */
export const networkStore = createStore(true);
/** El último intento llegó al servidor; null si aún no se ha probado. */
export const reachableStore = createStore<boolean | null>(null);
