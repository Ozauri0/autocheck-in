"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError } from "./api";
import { fromLocalInput } from "./dates";
import type { FormState } from "./forms";
import { nextPath } from "./next-path";
import { clearToken, setSession } from "./session";
import type { EventInput, SessionInput, UserInput } from "./types";

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

const FORBIDDEN = "No tiene permisos para esta acción.";

/** Mensaje de rechazo si quien invoca una acción de administración no es admin. */
async function denied(): Promise<string | undefined> {
  try {
    return (await api.me()).role === "admin" ? undefined : FORBIDDEN;
  } catch (e) {
    return failure(e);
  }
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email");
  const password = form.get("password");
  const values = { email };
  if (!email || typeof password !== "string" || !password) {
    return { message: "Ingrese su email y contraseña.", values };
  }
  let role;
  try {
    const { token, admin } = await api.login(email, password);
    role = admin.role;
    await setSession(token, role);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return {
      message: e.status === 401 ? "Email o contraseña incorrectos." : e.message,
      values,
    };
  }
  redirect(role === "ayudante" ? "/escanear" : nextPath(form.get("next")));
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
  const forbidden = await denied();
  if (forbidden) return { message: forbidden, values: formValues(form) };
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
  const forbidden = await denied();
  if (forbidden) return { message: forbidden };
  try {
    await api.setEventActive(id, active);
  } catch (e) {
    return { message: await failure(e) };
  }
  revalidatePath("/eventos", "layout");
  return { ok: true };
}

export async function deleteEventAction(id: string): Promise<FormState> {
  const forbidden = await denied();
  if (forbidden) return { message: forbidden };
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
  const forbidden = await denied();
  if (forbidden) return { message: forbidden, values: formValues(form) };
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
  const forbidden = await denied();
  if (forbidden) return { message: forbidden };
  try {
    await api.deleteSession(id);
  } catch (e) {
    return { message: await failure(e) };
  }
  revalidatePath("/eventos", "layout");
  return { ok: true };
}

export async function copyEventAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = formValues(form);
  const forbidden = await denied();
  if (forbidden) return { message: forbidden, values };

  const name = text(form, "name");
  const start = text(form, "startDate");
  const startDate = start ? fromLocalInput(start) : null;
  const errors: Record<string, string> = {};
  if (!name) errors.name = "El nombre es obligatorio.";
  if (start && !startDate) errors.startDate = "Fecha y hora no válidas.";
  if (Object.keys(errors).length) return { errors, values };

  let copyId: string;
  try {
    copyId = (await api.copyEvent(text(form, "id"), { name, startDate: startDate ?? undefined })).id;
  } catch (e) {
    return { message: await failure(e), values };
  }
  revalidatePath("/eventos", "layout");
  redirect(`/eventos/${copyId}`);
}

/** Mensajes en español para los errores de la API de usuarios. */
const USER_ERRORS: Record<string, string> = {
  "name es obligatorio (máximo 200 caracteres)": "El nombre es obligatorio (máximo 200 caracteres).",
  'role debe ser "admin" o "ayudante"': "Seleccione un rol válido.",
  "no encontrado": "El usuario ya no existe. Recargue la página.",
};

async function userFailure(e: unknown): Promise<string> {
  const message = await failure(e);
  return USER_ERRORS[message] ?? message.charAt(0).toUpperCase() + message.slice(1);
}

export async function saveUserAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "id");
  // La contraseña no se recorta ni se devuelve al formulario.
  const password = String(form.get("password") ?? "");
  const values = formValues(form);
  delete values.password;
  const forbidden = await denied();
  if (forbidden) return { message: forbidden, values };

  const input: UserInput = {
    email: text(form, "email"),
    name: text(form, "name"),
    role: text(form, "role") === "admin" ? "admin" : "ayudante",
    password: password || undefined,
  };
  const errors: Record<string, string> = {};
  if (!input.name) errors.name = "El nombre es obligatorio.";
  if (!input.email.includes("@")) errors.email = "Ingrese un email válido.";
  if ((!id || password) && [...password].length < 4) {
    errors.password = "La contraseña debe tener al menos 4 caracteres.";
  }
  if (Object.keys(errors).length) return { errors, values };

  try {
    if (id) await api.updateUser(id, input);
    else await api.createUser(input);
  } catch (e) {
    return { message: await userFailure(e), values };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function deleteUserAction(id: string): Promise<FormState> {
  const forbidden = await denied();
  if (forbidden) return { message: forbidden };
  try {
    await api.deleteUser(id);
  } catch (e) {
    return { message: await userFailure(e) };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}
