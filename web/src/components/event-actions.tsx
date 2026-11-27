"use client";

import { Pencil, Power } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteEventAction, toggleEventAction } from "@/lib/actions";
import { ConfirmDelete } from "./confirm-delete";
import { CopyEvent } from "./copy-event";
import { button } from "./ui";

export function EventActions({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const toggleLabel = active ? `Desactivar ${name}` : `Activar ${name}`;

  function toggle() {
    startTransition(async () => {
      const result = await toggleEventAction(id, !active);
      setError(result.message);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        <Link
          href={`/eventos/${id}/editar`}
          className={button("ghost", "sm")}
          aria-label={`Editar ${name}`}
          title="Editar"
        >
          <Pencil aria-hidden className="size-4" />
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={button("secondary", "sm")}
          aria-label={toggleLabel}
        >
          <Power aria-hidden className="size-4" />
          {active ? "Desactivar" : "Activar"}
        </button>
        <CopyEvent id={id} name={name} compact />
        <ConfirmDelete
          title="Eliminar evento"
          label={`Eliminar ${name}`}
          action={deleteEventAction.bind(null, id)}
          warning={
            <>
              <p>
                ¿Eliminar el evento <strong>{name}</strong>?
              </p>
              <p className="mt-2 text-red-800">
                Se borrarán también todas sus sesiones y los registros de asistencia. Esta acción no
                se puede deshacer.
              </p>
            </>
          }
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
