"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { FormState } from "@/lib/forms";
import { Modal } from "./modal";
import { Alert, button } from "./ui";

export function ConfirmDelete({
  title,
  label,
  warning,
  action,
}: {
  title: string;
  label: string;
  warning: React.ReactNode;
  action: () => Promise<FormState>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(undefined);
  }

  function confirm() {
    startTransition(async () => {
      const result = await action();
      if (result?.ok) close();
      else setError(result?.message);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={button("ghostDanger", "sm")}
        aria-label={label}
        title={label}
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
      {open && (
        <Modal title={title} onClose={close}>
          <div className="space-y-4 text-sm">
            <div>{warning}</div>
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className={button("secondary")}>
                Cancelar
              </button>
              <button type="button" onClick={confirm} disabled={pending} className={button("danger")}>
                {pending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
