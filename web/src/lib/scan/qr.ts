// Mismas reglas que el backend (docs/API.md, "Formato del QR").
import type { Attendee } from "@/lib/types";

export function parseQr(raw: string): Attendee {
  if (!raw.includes("|")) return { name: raw, rut: "", email: "", extra: [] };
  const [name = "", rut = "", email = "", ...extra] = raw.split("|").map((p) => p.trim());
  return { name, rut, email, extra };
}

export function attendeeKey(raw: string): string {
  const { rut, email } = parseQr(raw);
  const normalizedRut = rut.replace(/[.\-\s]/g, "").toLowerCase();
  if (normalizedRut) return normalizedRut;
  if (email) return email.toLowerCase();
  return raw.trim().toLowerCase();
}
