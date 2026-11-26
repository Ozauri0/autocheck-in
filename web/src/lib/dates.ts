/** Utilidades de fecha en la zona de negocio, sin depender de la zona del servidor o navegador. */
export const TIME_ZONE = "America/Santiago";

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Hora de pared en Santiago para un instante, expresada como si fuera UTC (ms). */
function wallClock(instant: number): number {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormat.formatToParts(instant)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function offsetAt(instant: number): number {
  const whole = Math.floor(instant / 1000) * 1000;
  return wallClock(whole) - whole;
}

/** RFC3339 → valor de <input type="datetime-local"> en hora de Santiago. */
export function toLocalInput(iso: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return "";
  return new Date(wallClock(instant)).toISOString().slice(0, 16);
}

/**
 * Valor de datetime-local (hora de Santiago) → RFC3339 con el offset correcto.
 * En el cambio de horario: una hora repetida toma la primera ocurrencia y una hora
 * inexistente se adelanta. Devuelve null si el valor no es válido.
 */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wall = Date.parse(`${value}:00Z`);
  if (Number.isNaN(wall) || new Date(wall).toISOString().slice(0, 16) !== value) return null;

  const day = 86_400_000;
  const before = offsetAt(wall - day);
  const after = offsetAt(wall + day);
  const matches = [wall - before, wall - after].filter((t) => wallClock(t) === wall);
  const instant = matches.length ? Math.min(...matches) : wall - before;

  const offset = offsetAt(instant);
  const abs = Math.abs(offset) / 60_000;
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const local = new Date(instant + offset).toISOString().slice(0, 19);
  return `${local}${offset < 0 ? "-" : "+"}${hh}:${mm}`;
}

function formatter(options: Intl.DateTimeFormatOptions) {
  const format = new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, ...options });
  return (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : format.format(date);
  };
}

export const formatDate = formatter({ dateStyle: "medium" });
export const formatDateTime = formatter({ dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
export const formatTimestamp = formatter({
  dateStyle: "short",
  timeStyle: "medium",
  hourCycle: "h23",
});
export const formatTime = formatter({ timeStyle: "short", hourCycle: "h23" });

export function formatRange(start: string, end: string): string {
  const sameDay = formatDate(start) === formatDate(end);
  return `${formatDateTime(start)} – ${sameDay ? formatTime(end) : formatDateTime(end)}`;
}
