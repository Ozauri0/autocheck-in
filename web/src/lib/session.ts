import "server-only";
import { cookies } from "next/headers";
import { ROLE_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE } from "./session-cookie";
import type { Role } from "./types";

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getRoleCookie(): Promise<Role> {
  return (await cookies()).get(ROLE_COOKIE)?.value === "ayudante" ? "ayudante" : "admin";
}

/** Solo en server actions o route handlers. */
export async function setSession(token: string, role: Role) {
  const store = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
  store.set(SESSION_COOKIE, token, options);
  store.set(ROLE_COOKIE, role, options);
}

/** Solo en server actions o route handlers. */
export async function clearToken() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ROLE_COOKIE);
}
