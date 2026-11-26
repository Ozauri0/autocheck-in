"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveEventAction } from "@/lib/actions";
import { toLocalInput } from "@/lib/dates";
import type { FormState } from "@/lib/forms";
import type { Event } from "@/lib/types";
import { Alert, button, card, Field, fieldProps } from "./ui";

export function EventForm({ event }: { event?: Event }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEventAction, {});
  const { errors = {}, values } = state;
  const initial = {
    name: event?.name ?? "",
    description: event?.description ?? "",
    location: event?.location ?? "",
    startDate: event ? toLocalInput(event.startDate) : "",
    endDate: event ? toLocalInput(event.endDate) : "",
  };
  const value = (key: keyof typeof initial) => values?.[key] ?? initial[key];
  const active = values ? values.active === "on" : (event?.active ?? true);

  return (
    <form action={action} noValidate className={`${card} space-y-4 p-5`}>
      {event && <input type="hidden" name="id" value={event.id} />}
      {state.message && <Alert>{state.message}</Alert>}
      {state.errors && <Alert>Revise los campos marcados.</Alert>}

      <Field label="Nombre *" name="name" error={errors.name}>
        <input {...fieldProps("name", errors.name)} required defaultValue={value("name")} />
      </Field>
      <Field label="Descripción" name="description">
        <textarea {...fieldProps("description")} rows={3} defaultValue={value("description")} />
      </Field>
      <Field label="Lugar" name="location">
        <input {...fieldProps("location")} defaultValue={value("location")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inicio *" name="startDate" error={errors.startDate} hint="Hora de Chile">
          <input
            {...fieldProps("startDate", errors.startDate)}
            type="datetime-local"
            required
            defaultValue={value("startDate")}
          />
        </Field>
        <Field label="Término *" name="endDate" error={errors.endDate} hint="Hora de Chile">
          <input
            {...fieldProps("endDate", errors.endDate)}
            type="datetime-local"
            required
            defaultValue={value("endDate")}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} className="size-4" />
        Evento activo (visible en las tablets de check-in)
      </label>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Link href={event ? `/eventos/${event.id}` : "/eventos"} className={button("secondary")}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={button()}>
          {pending ? "Guardando…" : event ? "Guardar cambios" : "Crear evento"}
        </button>
      </div>
    </form>
  );
}
