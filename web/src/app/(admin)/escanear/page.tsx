import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScanApp } from "@/components/scan/scan-app";
import { Alert } from "@/components/ui";
import { api, ApiError, type EventDetail } from "@/lib/api";

export const metadata: Metadata = { title: "Escanear QR" };

export default async function ScanPage() {
  let events: EventDetail[] = [];
  let failure = "";
  try {
    events = await api.deviceEvents();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 401) redirect("/api/auth/expired?next=/escanear");
    failure = e.message;
  }
  // Aun sin lista se monta el escáner: así se puede sincronizar lo pendiente.
  return (
    <div className="mx-auto max-w-md space-y-4">
      {failure && <Alert>{failure}</Alert>}
      <ScanApp events={events} />
    </div>
  );
}
