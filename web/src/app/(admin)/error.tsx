"use client";

import { Alert, button } from "@/components/ui";

export default function AdminError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="space-y-4">
      <Alert>Ocurrió un error inesperado.</Alert>
      <button type="button" onClick={() => retry()} className={button("secondary")}>
        Reintentar
      </button>
    </div>
  );
}
