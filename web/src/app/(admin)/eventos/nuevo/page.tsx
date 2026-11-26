import type { Metadata } from "next";
import { EventForm } from "@/components/event-form";

export const metadata: Metadata = { title: "Nuevo evento" };

export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-navy">Nuevo evento</h1>
      <EventForm />
    </div>
  );
}
