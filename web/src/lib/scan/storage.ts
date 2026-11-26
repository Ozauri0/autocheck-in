// localStorage puede faltar o fallar (modo privado, cuota): en ese caso se usa memoria.
const memory = new Map<string, string>();
const PREFIX = "autocheckin.scan.";

export function read<T>(key: string, fallback: T): T {
  try {
    const stored = memory.get(key) ?? window.localStorage.getItem(PREFIX + key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Devuelve false si solo quedó en memoria (se pierde al cerrar la página). */
export function write(key: string, value: unknown): boolean {
  const text = JSON.stringify(value);
  try {
    window.localStorage.setItem(PREFIX + key, text);
    memory.delete(key);
    return true;
  } catch {
    memory.set(key, text);
    return false;
  }
}

/** `randomUUID` solo existe en contexto seguro; sin él la cámara tampoco funciona. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
