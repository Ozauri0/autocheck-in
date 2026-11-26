"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { card, EmptyState, input, Loading } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { sync } from "@/lib/scan/queue";
import { read, uuid, write } from "@/lib/scan/storage";
import type { EventDetail, Session } from "@/lib/types";
import { Scanner } from "./scanner";
import { SyncStatus } from "./sync-status";

const SYNC_MS = 30_000;
const DEFAULT_NAME = "Celular ayudante";

interface Prefs {
  eventId: string;
  sessionId: string;
  deviceName: string;
}

function loadDeviceId(): string {
  let id = read("deviceId", "");
  if (!id) {
    id = `web-${uuid()}`;
    write("deviceId", id);
  }
  return id;
}

const never = () => () => {};

/** Todo depende del navegador (localStorage, cámara): no se renderiza en el servidor. */
export function ScanApp({ events }: { events: EventDetail[] }) {
  const mounted = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  return mounted ? <ScanSteps events={events} /> : <Loading />;
}

function ScanSteps({ events }: { events: EventDetail[] }) {
  const [prefs, setPrefs] = useState(() =>
    read<Prefs>("prefs", { eventId: "", sessionId: "", deviceName: "" }),
  );
  const [deviceId] = useState(loadDeviceId);
  // Copia propia: un refresco de la lista no debe cerrar el escáner abierto.
  const [target, setTarget] = useState<{ event: EventDetail; session: Session } | null>(null);

  useEffect(() => {
    const run = () => void sync();
    run();
    window.addEventListener("online", run);
    const timer = setInterval(run, SYNC_MS);
    return () => {
      window.removeEventListener("online", run);
      clearInterval(timer);
    };
  }, []);

  const update = (changes: Partial<Prefs>) => {
    const next = { ...prefs, ...changes };
    setPrefs(next);
    write("prefs", next);
  };

  if (target) {
    return (
      <Scanner
        event={target.event}
        session={target.session}
        deviceId={deviceId}
        deviceName={prefs.deviceName.trim() || DEFAULT_NAME}
        onExit={() => setTarget(null)}
      />
    );
  }

  const event =
    events.find((e) => e.id === prefs.eventId) ?? (events.length === 1 ? events[0] : undefined);
  const sessions = event?.sessions ?? [];
  const last = sessions.find((s) => s.id === prefs.sessionId);

  const start = (session: Session) => {
    if (!event) return;
    update({ eventId: event.id, sessionId: session.id });
    setTarget({ event, session });
  };

  const choice = (selected: boolean) =>
    `${card} block w-full px-4 py-4 text-left ${selected ? "border-accent-strong ring-2 ring-accent" : ""}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-navy">Escanear QR</h1>
      <SyncStatus />

      <div>
        <label htmlFor="deviceName" className="mb-1 block text-sm font-medium text-navy">
          Nombre de este dispositivo
        </label>
        <input
          id="deviceName"
          className={`${input} py-3 text-base`}
          maxLength={60}
          placeholder="Celular Ayudante Sala 2"
          value={prefs.deviceName}
          onChange={(e) => update({ deviceName: e.target.value })}
        />
      </div>

      {!events.length && (
        <EmptyState title="No hay eventos activos">
          Active un evento en el panel y recargue esta página.
        </EmptyState>
      )}

      {last && (
        <button
          type="button"
          onClick={() => start(last)}
          className="w-full rounded-lg bg-accent-strong px-4 py-4 text-lg font-semibold text-white"
        >
          Continuar: {last.name}
        </button>
      )}

      {events.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-navy">1. Evento</h2>
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={e.id === event?.id}
              onClick={() => update({ eventId: e.id })}
              className={choice(e.id === event?.id)}
            >
              <span className="block text-lg font-medium text-navy">{e.name}</span>
              {e.location && <span className="text-sm text-slate-600">{e.location}</span>}
            </button>
          ))}
        </section>
      )}

      {event && (
        <section className="space-y-2">
          <h2 className="font-semibold text-navy">2. Sesión (toque para escanear)</h2>
          {!sessions.length && <p className="text-slate-600">Este evento no tiene sesiones.</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => start(s)}
              className={choice(s.id === prefs.sessionId)}
            >
              <span className="block text-lg font-medium text-navy">{s.name}</span>
              <span className="text-sm text-slate-600">
                {formatDateTime(s.startsAt)}
                {s.room && ` · ${s.room}`}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
