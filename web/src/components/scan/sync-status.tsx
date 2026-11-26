"use client";

import { useSyncExternalStore } from "react";
import { button } from "@/components/ui";
import { getState, subscribe, sync } from "@/lib/scan/queue";

export function SyncStatus() {
  const state = useSyncExternalStore(subscribe, getState, getState);
  return (
    <div className="space-y-2 text-sm">
      {state.needLogin && (
        <p role="alert" className="rounded-md bg-amber-100 px-3 py-2 text-amber-900">
          La sesión expiró. Los registros pendientes se conservan.{" "}
          <a href="/login?expirada=1&next=/escanear" className="font-semibold underline">
            Iniciar sesión
          </a>
        </p>
      )}
      {state.volatile && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-red-800">
          Este navegador no permite guardar datos: no cierre la página mientras haya pendientes.
        </p>
      )}
      {state.rejected > 0 && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-red-800">
          {state.rejected} registro(s) rechazado(s) por el servidor. Avise al administrador.
        </p>
      )}
      <button
        type="button"
        onClick={() => void sync()}
        disabled={state.syncing || !state.pending}
        className={`${button("secondary")} w-full py-3`}
      >
        {state.syncing ? "Sincronizando…" : `Sincronizar (${state.pending} pendientes)`}
      </button>
    </div>
  );
}
