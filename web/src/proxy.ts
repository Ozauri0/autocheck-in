import { NextResponse, type NextRequest } from "next/server";
import { ROLE_COOKIE, SESSION_COOKIE } from "@/lib/session-cookie";

/** Lo único que puede abrir un ayudante. */
const HELPER_PATHS = ["/escanear", "/api/scan", "/api/auth/expired"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Las server actions validan la sesión y el rol por sí mismas; un 307 aquí las rompería.
  if (request.headers.has("next-action")) return NextResponse.next();

  if (request.cookies.has(SESSION_COOKIE)) {
    if (request.cookies.get(ROLE_COOKIE)?.value !== "ayudante" || HELPER_PATHS.includes(pathname)) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No tiene permisos para esta acción" }, { status: 403 });
    }
    return redirectTo(request, "/escanear");
  }

  // El escáner espera un 401, no un redirect: el route handler lo responde.
  if (pathname === "/api/scan") return NextResponse.next();

  return redirectTo(request, "/login", pathname === "/escanear" ? "?next=/escanear" : "");
}

function redirectTo(request: NextRequest, pathname: string, search = "") {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|brand/|icon.png).*)"],
};
