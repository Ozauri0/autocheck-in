import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { api, ApiError } from "./api";
import { getRoleCookie } from "./session";
import type { User } from "./types";

/** Usuario según la API (rol vigente), una sola consulta por petición. */
export const getMe = cache((): Promise<User> => api.me());

/** Rol vigente; si la API no responde, el de la cookie. */
export async function currentRole() {
  try {
    return (await getMe()).role;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return getRoleCookie();
  }
}

/** Primera línea de cada página de administración. */
export async function requireAdmin(): Promise<void> {
  let role;
  try {
    role = (await getMe()).role;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 401) redirect("/api/auth/expired");
    return; // La carga de la página informa el error; la API sigue exigiendo el rol.
  }
  if (role !== "admin") redirect("/escanear");
}
