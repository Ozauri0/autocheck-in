import { formatTimestamp } from "@/lib/dates";
import { parseQr } from "@/lib/scan/qr";

export type Outcome =
  | { kind: "sending" | "ok" | "duplicate" | "offline" | "unauthorized" }
  | { kind: "error"; message: string };

export interface Result {
  clientId: string;
  raw: string;
  scannedAt: string;
  outcome: Outcome;
}

const looks = {
  sending: ["bg-slate-600", "Enviando…"],
  ok: ["bg-green-700", "✓ Registrado"],
  duplicate: ["bg-amber-600", "Ya registrado en esta sesión"],
  offline: ["bg-sky-800", "Guardado sin conexión, se enviará luego"],
  unauthorized: ["bg-amber-700", "Guardado. Inicie sesión para enviarlo"],
  error: ["bg-red-700", "Rechazado por el servidor"],
};

export function ResultCard({ result, onClose }: { result: Result; onClose: () => void }) {
  const attendee = parseQr(result.raw);
  const { outcome } = result;
  const [color, title] = looks[outcome.kind];
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
      <button
        type="button"
        onClick={onClose}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white text-center shadow-2xl"
      >
        <span role="status" className={`block px-4 py-5 text-2xl font-bold text-white ${color}`}>
          {title}
          {outcome.kind === "error" && (
            <span className="block text-base font-normal">{outcome.message}</span>
          )}
        </span>
        <span className="block space-y-1 px-4 py-5 break-words text-navy">
          <span className="block text-3xl font-bold">{attendee.name || "Sin nombre"}</span>
          {attendee.rut && <span className="block text-xl">RUT {attendee.rut}</span>}
          {attendee.email && <span className="block text-lg">{attendee.email}</span>}
          <span className="block text-slate-600">{formatTimestamp(result.scannedAt)}</span>
          <span className="block pt-2 text-sm text-slate-500">Se cierra solo · toque para cerrar antes</span>
        </span>
      </button>
    </div>
  );
}
