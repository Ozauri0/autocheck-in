import type { NextRequest } from "next/server";
import { api, ApiError } from "@/lib/api";
import { nextPath } from "@/lib/next-path";
import { clearToken } from "@/lib/session";

export async function GET(request: NextRequest) {
  const next = nextPath(request.nextUrl.searchParams.get("next"));
  const login = `/login?next=${next}`;
  // Solo se cierra la sesión si la API confirma que el token ya no sirve,
  // para que un enlace externo a esta ruta no pueda desconectar al usuario.
  try {
    await api.me();
    return redirectTo(next);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) return redirectTo(login);
  }
  await clearToken();
  return redirectTo(`${login}&expirada=1`);
}

/** Location relativa: detrás de un proxy o en Docker el host de request.url no es el público. */
function redirectTo(location: string) {
  return new Response(null, { status: 307, headers: { Location: location } });
}
