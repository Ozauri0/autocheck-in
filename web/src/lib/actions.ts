"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError } from "./api";
import { fromLocalInput } from "./dates";
import type { FormState } from "./forms";
import { nextPath } from "./next-path";
import { clearToken, setToken } from "./session";
import type { EventInput, SessionInput } from "./types";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** Un 401 borra la cookie y vuelve al login; el resto se informa en pantalla. */
async function failure(e: unknown): Promise<string> {
  if (!(e instanceof ApiError)) throw e;
  if (e.status === 401) {
    await clearToken();
    redirect("/login?expirada=1");
  }
  return e.message;
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  const password = form.get("password");
  const values = { email };
  if (!email || typeof password !== "string" || !password) {
    return { message: "Ingrese su email y contraseña.", values };
  }
  try {
    const { token } = await api.login(email, password);
    await setToken(token);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return {
      message: e.status === 401 ? "Email o contraseña incorrectos." : e.message,
      values,
    };
  }
  redirect(nextPath(form.get("next")));
}

export async function logoutAction() {
  await clearToken();
  redirect("/login");
}

/** Valida un par inicio/término y devuelve ambos en RFC3339. */
function parseRange(
  form: FormData,
  startKey: string,
  endKey: string,
  errors: Record<string, string>,
) {
  const start = fromLocalInput(text(form, startKey));
  const end = fromLocalInput(text(form, endKey));
  if (!start) errors[startKey] = "Indique fecha y hora de inicio.";
  if (!end) errors[endKey] = "Indique fecha y hora de término.";
  if (start && end && Date.parse(end) <= Date.parse(start)) {
    errors[endKey] = "El término debe ser posterior al inicio.";
  }
  return { start: start ?? "", end: end ?? "" };
}

export async function saveEventAction(_prev: FormState, form: FormData): Promise<FormState> {
  // El id viaja en el formulario y no con .bind(): en Next 16.4, enviar antes de la hidratación
  // una acción enlazada dentro de useActionState deja el render del servidor en un bucle.
  const id = text(form, "id");
  const errors: Record<string, string> = {};
  const name = text(form, "name");
  if (!name) errors.name = "El nombre es obligatorio.";
  const { start, end } = parseRange(form, "startDate", "endDate", errors);
  const values = formValues(form);
  if (Object.keys(errors).length) return { errors, values };

  const input: EventInput = {
    name,
    description: text(form, "description"),
    location: text(form, "location"),
    startDate: start,
    endDate: end,
    active: form.get("active") === "on",
  };

  let savedId: string;
  try {
    savedId = (id ? await api.updateEvent(id, input) : await api.createEvent(input)).id;
  } catch (e) {
    return { message: await failure(e), values };
  }
  revalidatePath("/eventos", "layout");
  redirect(`/eventos/${savedId}`);
}

export async function toggleEventAction(id: string, active: boolean): Promise<FormState> {
  try {
    await api.setEventActive(id, active);
  } catch (e) {
    return { message: await failure(e) };
  }
  revalidatePath("/eventos", "layout");
  return { ok: true };
}

export async function deleteEventAction(id: string): Promise<FormState> {
  try {
    await api.deleteEvent(id);
  } catch (e) {
    return { message: await failure(e) };
  }
  revalidatePath("/eventos", "layout");
  return { ok: true };
}

export async function saveSessionAction(
  eventId: string,
  sessionId: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const errors: Record<string, string> = {};
  const name = text(form, "name");
  if (!name) errors.name = "El nombre es obligatorio.";
  const { start, end } = parseRange(form, "startsAt", "endsAt", errors);
  const order = Number(text(form, "order") || "0");
  if (!Number.isInteger(order) || order < 0) {
    errors.order = "El orden debe ser un número entero positivo o cero.";
  }
  const values = formValues(form);
  if (Object.keys(errors).length) return { errors, values };

  const input: SessionInput = {
    name,
    room: text(form, "room"),
    startsAt: start,
    endsAt: end,
    order,
  };
  try {
    if (sessionId) await api.updateSession(sessionId, input);
    else await api.createSession(eventId, input);
  } catch (e) {
    return { message: await failure(e), values };
  }
  revalidatePath("/eventos", "layout");
  return { ok: true };
}

export async function deleteSessionAction(id: string): Promise<FormState> {
  try {
    await api.deleteSession(id);
  } catch (e) {
    return { message: await failure(e) };
  }
  revalidatePath("/eventos", "layout");
  return { ok: true };
}
