"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteSessionAction, saveSessionAction } from "@/lib/actions";
import { formatRange, toLocalInput } from "@/lib/dates";
import type { FormState } from "@/lib/forms";
import type { Session } from "@/lib/types";
import { ConfirmDelete } from "./confirm-delete";
import { Modal } from "./modal";
import { Alert, button, card, EmptyState, Field, fieldProps, td, th, thead } from "./ui";

export function SessionsPanel({ eventId, sessions }: { eventId: string; sessions: Session[] }) {
  // null: cerrado · "new": creación · Session: edición
  const [editing, setEditing] = useState<Session | "new" | null>(null);
  const nextOrder = sessions.reduce((max, s) => Math.max(max, s.order), 0) + 1;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing("new")} className={button()}>
          <Plus aria-hidden className="size-4" />
          Nueva sesión
        </button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="Este evento aún no tiene sesiones">
          Cree la primera para que las tablets puedan registrar asistencia.
        </EmptyState>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <caption className="sr-only">Sesiones del evento</caption>
            <thead className={thead}>
              <tr>
                <th className={th}>Orden</th>
                <th className={th}>Nombre</th>
                <th className={th}>Sala</th>
                <th className={th}>Horario</th>
                <th className={th}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className={`${td} tabular-nums`}>{s.order}</td>
                  <td className={`${td} min-w-48 font-medium text-navy`}>{s.name}</td>
                  <td className={td}>{s.room || "—"}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatRange(s.startsAt, s.endsAt)}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        className={button("ghost", "sm")}
                        aria-label={`Editar ${s.name}`}
                        title="Editar"
                      >
                        <Pencil aria-hidden className="size-4" />
                      </button>
                      <ConfirmDelete
                        title="Eliminar sesión"
                        label={`Eliminar ${s.name}`}
                        action={deleteSessionAction.bind(null, s.id)}
                        warning={
                          <>
                            <p>
                              ¿Eliminar la sesión <strong>{s.name}</strong>?
                            </p>
                            <p className="mt-2 text-red-800">
                              Se borrarán también sus registros de asistencia. Esta acción no se
                              puede deshacer.
                            </p>
                          </>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? "Nueva sesión" : "Editar sesión"}
          onClose={() => setEditing(null)}
        >
          <SessionForm
            eventId={eventId}
            session={editing === "new" ? undefined : editing}
            defaultOrder={nextOrder}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function SessionForm({
  eventId,
  session,
  defaultOrder,
  onDone,
}: {
  eventId: string;
  session?: Session;
  defaultOrder: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await saveSessionAction(eventId, session?.id ?? null, prev, form);
    if (result.ok) onDone();
    return result;
  }, {});
  const { errors = {}, values } = state;
  const initial = {
    name: session?.name ?? "",
    room: session?.room ?? "",
    startsAt: session ? toLocalInput(session.startsAt) : "",
    endsAt: session ? toLocalInput(session.endsAt) : "",
    order: String(session?.order ?? defaultOrder),
  };
  const value = (key: keyof typeof initial) => values?.[key] ?? initial[key];

  return (
    <form action={action} noValidate className="space-y-4">
      {state.message && <Alert>{state.message}</Alert>}
      <Field label="Nombre *" name="name" error={errors.name}>
        <input {...fieldProps("name", errors.name)} required defaultValue={value("name")} />
      </Field>
      <Field label="Sala" name="room">
        <input {...fieldProps("room")} defaultValue={value("room")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inicio *" name="startsAt" error={errors.startsAt} hint="Hora de Chile">
          <input
            {...fieldProps("startsAt", errors.startsAt)}
            type="datetime-local"
            required
            defaultValue={value("startsAt")}
          />
        </Field>
        <Field label="Término *" name="endsAt" error={errors.endsAt} hint="Hora de Chile">
          <input
            {...fieldProps("endsAt", errors.endsAt)}
            type="datetime-local"
            required
            defaultValue={value("endsAt")}
          />
        </Field>
      </div>
      <Field label="Orden" name="order" error={errors.order}>
        <input
          {...fieldProps("order", errors.order)}
          type="number"
          min={0}
          step={1}
          defaultValue={value("order")}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={button("secondary")}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={button()}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
