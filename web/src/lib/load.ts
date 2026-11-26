import "server-only";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "./api";

export type Loaded<T> = { data: T; error?: never } | { data?: never; error: string };

/**
 * Carga de datos para Server Components. Un 401 pasa por el route handler que borra la cookie
 * (un Server Component no puede hacerlo), un 404 muestra not-found y el resto se devuelve
 * como mensaje para pintar el estado de error.
 */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await fn() };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 401) redirect("/api/auth/expired");
    if (e.status === 404) notFound();
    return { error: e.message };
  }
}
