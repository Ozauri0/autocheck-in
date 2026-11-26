import type { NextRequest } from "next/server";
import { api, ApiError } from "@/lib/api";
import { clearToken } from "@/lib/session";
import type { CheckinInput } from "@/lib/types";

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/** Reenvía los escaneos del navegador a la API con el JWT de la cookie. */
export async function POST(request: NextRequest) {
  // Exigir JSON impide que un formulario de otro origen envíe registros.
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return error(415, "Se esperaba JSON");
  }
  const body = (await request.json().catch(() => null)) as { checkins?: CheckinInput[] } | null;
  if (!Array.isArray(body?.checkins)) return error(400, "checkins es obligatorio");

  try {
    return Response.json(await api.deviceCheckins(body.checkins));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 401) await clearToken();
    return error(e.status, e.message);
  }
}
