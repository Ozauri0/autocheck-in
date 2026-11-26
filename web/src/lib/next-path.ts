/** Destino tras el login: lista cerrada para no permitir redirecciones abiertas. */
export function nextPath(value: unknown): "/escanear" | "/eventos" {
  return value === "/escanear" ? "/escanear" : "/eventos";
}
