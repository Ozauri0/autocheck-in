"use client";

import { SwitchCamera } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { createDecoder } from "@/lib/scan/decoder";
import { enqueue, send, type SendResponse } from "@/lib/scan/queue";
import type { CheckinInput, Event, Session } from "@/lib/types";
import { ResultCard, type Outcome, type Result } from "./result-card";
import { SyncStatus } from "./sync-status";

const SAME_QR_MS = 5000;
const CARD_MS = 4000;
/** Tiempo que la tarjeta espera al servidor antes de darlo por "se enviará luego". */
const SEND_WAIT_MS = 2500;
const FRAME_MS = 200;

type Facing = "environment" | "user";

function toOutcome(response: SendResponse, record: CheckinInput, repeated: boolean): Outcome {
  if (response.kind === "unauthorized") return { kind: "unauthorized" };
  if (response.kind === "failed") return { kind: repeated ? "duplicate" : "offline" };
  const result = response.results.find((r) => r.clientId === record.clientId);
  if (result?.status === "error") {
    return { kind: "error", message: result.message ?? "Registro inválido" };
  }
  const duplicate = repeated || result?.status === "duplicate" || result?.duplicate;
  return { kind: duplicate ? "duplicate" : "ok" };
}

function cameraProblem(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") {
    return "Permiso de cámara denegado. Habilítelo en el navegador y recargue la página.";
  }
  if (name === "NotFoundError") return "No se encontró ninguna cámara en este dispositivo.";
  if (name === "NotReadableError") return "La cámara está siendo usada por otra aplicación.";
  return "No fue posible usar la cámara.";
}

function unavailable(): string {
  if (!window.isSecureContext) return "Abre el panel por HTTPS para usar la cámara";
  if (!navigator.mediaDevices?.getUserMedia) return "Este navegador no permite usar la cámara.";
  return "";
}

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let done = false;
    const request = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (done) await next?.release();
        else lock = next;
      } catch {
        // Batería baja o no permitido: se sigue sin él.
      }
    };
    void request();
    // El navegador lo libera al ocultar la página.
    document.addEventListener("visibilitychange", request);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);
}

export function Scanner({
  event,
  session,
  deviceId,
  deviceName,
  onExit,
}: {
  event: Event;
  session: Session;
  deviceId: string;
  deviceName: string;
  onExit: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [blocked] = useState(unavailable);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  // Refs: se leen varios cuadros por segundo, antes de que React vuelva a renderizar.
  const busy = useRef(false);
  const seen = useRef(new Map<string, number>());
  const shown = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useWakeLock();

  const close = useCallback(() => {
    clearTimeout(timer.current);
    shown.current = "";
    busy.current = false;
    setResult(null);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onScan = async (raw: string) => {
    const now = Date.now();
    if (busy.current || !raw.trim()) return;
    if (now - (seen.current.get(raw) ?? 0) < SAME_QR_MS) return;
    busy.current = true;
    seen.current.set(raw, now);
    navigator.vibrate?.(120);

    const { record, repeated } = enqueue({
      eventId: event.id,
      sessionId: session.id,
      deviceId,
      deviceName,
      raw,
    });
    const base = { clientId: record.clientId, raw, scannedAt: record.scannedAt };
    shown.current = record.clientId;
    setResult({ ...base, outcome: { kind: "sending" } });

    const show = (outcome: Outcome) => {
      // La tarjeta ya se cerró: no se vuelve a abrir.
      if (shown.current !== record.clientId) return;
      setResult({ ...base, outcome });
      if (outcome.kind === "duplicate" || outcome.kind === "error") {
        navigator.vibrate?.([200, 100, 200]);
      }
    };
    const request = send([record]).then((response) => toOutcome(response, record, repeated));
    let wait: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      wait = setTimeout(resolve, SEND_WAIT_MS, null);
    });
    const first = await Promise.race([request, timeout]);
    clearTimeout(wait);
    show(first ?? { kind: repeated ? "duplicate" : "offline" });
    if (!first) void request.then(show);
    if (shown.current === record.clientId) timer.current = setTimeout(close, CARD_MS);
  };

  const onFrame = useEffectEvent((raw: string) => void onScan(raw));

  useEffect(() => {
    if (blocked) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let frame: ReturnType<typeof setTimeout> | undefined;
    const element = video.current;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 } },
        });
        if (stopped || !element) return stream.getTracks().forEach((t) => t.stop());
        element.srcObject = stream;
        await element.play();
      } catch (e) {
        if (!stopped) setFailure(cameraProblem(e));
        return;
      }
      let decode;
      try {
        decode = await createDecoder();
      } catch {
        if (!stopped) setFailure("No se pudo cargar el lector de QR. Recargue la página.");
        return;
      }
      const loop = async () => {
        if (stopped) return;
        if (!busy.current && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const raw = await decode(element).catch(() => null);
          if (stopped) return;
          if (raw) onFrame(raw);
        }
        frame = setTimeout(loop, FRAME_MS);
      };
      void loop();
    })();

    return () => {
      stopped = true;
      clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
      if (element) element.srcObject = null;
    };
  }, [blocked, facing]);

  const problem = blocked || failure;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <header className="flex items-center gap-3 border-b-4 border-accent bg-navy px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{event.name}</p>
          <p className="line-clamp-2 text-sm text-sky-200">
            {session.name}
            {session.room && ` · ${session.room}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="shrink-0 rounded-md border border-white/40 px-3 py-2 text-sm font-medium"
        >
          Cambiar sesión
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Vista de la cámara"
          className={`absolute inset-0 size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        <p
          role={problem ? "alert" : undefined}
          className={
            problem
              ? "absolute inset-x-4 top-1/3 rounded-lg bg-white p-4 text-center text-lg font-semibold text-red-800"
              : "absolute inset-x-4 bottom-4 text-center text-xl font-bold [text-shadow:0_0_8px_black]"
          }
        >
          {problem || "Acerque el código QR a la cámara"}
        </p>
      </div>

      <footer className="space-y-2 bg-navy p-3">
        <SyncStatus />
        {!blocked && (
          <button
            type="button"
            onClick={() => {
              setFailure("");
              setFacing(facing === "user" ? "environment" : "user");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-strong py-3 font-medium"
          >
            <SwitchCamera aria-hidden className="size-5" />
            Cámara: {facing === "user" ? "frontal" : "trasera"}
          </button>
        )}
      </footer>

      {result && <ResultCard result={result} onClose={close} />}
    </div>
  );
}
