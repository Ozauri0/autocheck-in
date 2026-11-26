import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  // Las server actions validan la sesión por sí mismas y redirigen; un 307 aquí las rompería.
  if (request.headers.has("next-action")) return NextResponse.next();

  // El escáner espera un 401, no un redirect: el route handler lo responde.
  if (request.nextUrl.pathname === "/api/scan") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (request.nextUrl.pathname === "/escanear") url.search = "?next=/escanear";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
