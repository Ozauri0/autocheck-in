"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { copyEventAction } from "@/lib/actions";
import type { FormState } from "@/lib/forms";
import { Modal } from "./modal";
import { Alert, button, Field, fieldProps } from "./ui";

export function CopyEvent({ id, name, compact }: { id: string; name: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={button("secondary", compact ? "sm" : "md")}
        aria-label={`Copiar ${name}`}
      >
        <Copy aria-hidden className="size-4" />
        Copiar
      </button>
      {open && (
        <Modal title="Copiar evento" onClose={() => setOpen(false)}>
          <CopyForm id={id} name={name} onCancel={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

function CopyForm({ id, name, onCancel }: { id: string; name: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(copyEventAction, {});
  const { errors = {}, values } = state;
  return (
    <form action={action} noValidate className="space-y-4 text-sm">
      <input type="hidden" name="id" value={id} />
      {state.message && <Alert>{state.message}</Alert>}
      <p>
        Se copian las sesiones, sin los registros de asistencia. El evento nuevo queda inactivo.
      </p>
      <Field label="Nombre *" name="name" error={errors.name}>
        <input
          {...fieldProps("name", errors.name)}
          required
          defaultValue={values?.name ?? `${name} (copia)`}
        />
      </Field>
      <Field
        label="Nueva fecha de inicio"
        name="startDate"
        error={errors.startDate}
        hint="Opcional, hora de Chile. Las sesiones se desplazan junto con el evento."
      >
        <input
          {...fieldProps("startDate", errors.startDate)}
          type="datetime-local"
          defaultValue={values?.startDate}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={button("secondary")}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={button()}>
          {pending ? "Copiando…" : "Copiar evento"}
        </button>
      </div>
    </form>
  );
}
