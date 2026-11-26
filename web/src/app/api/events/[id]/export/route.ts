import type { NextRequest } from "next/server";
import { api, ApiError } from "@/lib/api";
import { clearToken } from "@/lib/session";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";

  try {
    const upstream = await api.exportXlsx(id, sessionId);
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? XLSX,
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? 'attachment; filename="consolidado.xlsx"',
      "Cache-Control": "no-store",
    });
    // Si fetch descomprimió el cuerpo, el largo original ya no corresponde.
    const length = upstream.headers.get("content-length");
    if (length && !upstream.headers.has("content-encoding")) headers.set("Content-Length", length);
    return new Response(upstream.body, { headers });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    let location = `/eventos/${encodeURIComponent(id)}?errorExport=1`;
    if (e.status === 401) {
      await clearToken();
      location = "/login?expirada=1";
    }
    return new Response(null, { status: 303, headers: { Location: location } });
  }
}
