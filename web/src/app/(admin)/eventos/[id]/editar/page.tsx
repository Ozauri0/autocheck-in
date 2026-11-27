import type { Metadata } from "next";
import { EventForm } from "@/components/event-form";
import { Alert } from "@/components/ui";
import { api } from "@/lib/api";
import { load } from "@/lib/load";
import { requireAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Editar evento" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { data: event, error } = await load(() => api.getEvent(id));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-navy">Editar evento</h1>
      {error !== undefined ? <Alert>{error}</Alert> : <EventForm event={event} />}
    </div>
  );
}
