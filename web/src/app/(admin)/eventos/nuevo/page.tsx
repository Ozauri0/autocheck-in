import type { Metadata } from "next";
import { EventForm } from "@/components/event-form";
import { requireAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Nuevo evento" };

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-navy">Nuevo evento</h1>
      <EventForm />
    </div>
  );
}
