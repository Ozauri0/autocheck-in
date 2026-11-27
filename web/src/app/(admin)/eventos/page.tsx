import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventActions } from "@/components/event-actions";
import { Alert, Badge, button, card, EmptyState, td, th, thead } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { load } from "@/lib/load";
import { requireAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Eventos" };

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ inactivos?: string }>;
}) {
  await requireAdmin();
  const showInactive = (await searchParams).inactivos !== "0";
  const { data: events, error } = await load(() => api.listEvents(showInactive));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">Eventos</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={showInactive ? "/eventos?inactivos=0" : "/eventos"}
            role="switch"
            aria-checked={showInactive}
            className="inline-flex items-center gap-2 text-sm"
          >
            <span
              aria-hidden
              className={`flex h-5 w-9 rounded-full p-0.5 ${showInactive ? "justify-end bg-accent-strong" : "bg-slate-400"}`}
            >
              <span className="size-4 rounded-full bg-white" />
            </span>
            Mostrar inactivos
          </Link>
          <Link href="/eventos/nuevo" className={button()}>
            <Plus aria-hidden className="size-4" />
            Nuevo evento
          </Link>
        </div>
      </div>

      {error !== undefined ? (
        <Alert>
          {error}{" "}
          <Link href={showInactive ? "/eventos" : "/eventos?inactivos=0"} className="underline">
            Reintentar
          </Link>
        </Alert>
      ) : events.length === 0 ? (
        <EmptyState title={showInactive ? "Aún no hay eventos" : "No hay eventos activos"}>
          <Link href="/eventos/nuevo" className="text-accent-strong underline">
            Crear un evento
          </Link>
        </EmptyState>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <caption className="sr-only">Listado de eventos</caption>
            <thead className={thead}>
              <tr>
                <th className={th}>Nombre</th>
                <th className={th}>Fechas</th>
                <th className={th}>Lugar</th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right`}>Sesiones</th>
                <th className={`${th} text-right`}>Check-ins</th>
                <th className={th}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} min-w-48`}>
                    <Link
                      href={`/eventos/${e.id}`}
                      className="font-medium text-accent-strong hover:underline"
                    >
                      {e.name}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatDateTime(e.startDate)}
                    <br />
                    <span className="text-slate-500">{formatDateTime(e.endDate)}</span>
                  </td>
                  <td className={`${td} min-w-32`}>{e.location || "—"}</td>
                  <td className={td}>
                    <Badge tone={e.active ? "green" : "gray"}>
                      {e.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{e.sessionCount}</td>
                  <td className={`${td} text-right tabular-nums`}>{e.checkinCount}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <EventActions id={e.id} name={e.name} active={e.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
