import { api, ApiError } from "@/lib/api";
import { clearToken } from "@/lib/session";

export async function GET() {
  // Solo se cierra la sesión si la API confirma que el token ya no sirve,
  // para que un enlace externo a esta ruta no pueda desconectar al usuario.
  try {
    await api.me();
    return redirectTo("/eventos");
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) return redirectTo("/login");
  }
  await clearToken();
  return redirectTo("/login?expirada=1");
}

/** Location relativa: detrás de un proxy o en Docker el host de request.url no es el público. */
function redirectTo(location: string) {
  return new Response(null, { status: 307, headers: { Location: location } });
}
