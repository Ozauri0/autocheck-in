import { ArrowLeft, Download, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AttendeesPanel } from "@/components/attendees-panel";
import { CopyEvent } from "@/components/copy-event";
import { SessionsPanel } from "@/components/sessions-panel";
import { StatsPanel } from "@/components/stats-panel";
import { Alert, Badge, button, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { formatRange } from "@/lib/dates";
import { load } from "@/lib/load";
import { requireAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Detalle de evento" };

const TABS = [
  { key: "sesiones", label: "Sesiones" },
  { key: "asistentes", label: "Asistentes" },
  { key: "resumen", label: "Resumen" },
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab = TABS.find((t) => t.key === first(query.tab))?.key ?? "sesiones";
  const { data: event, error } = await load(() => api.getEvent(id));

  if (error !== undefined) {
    return (
      <Alert>
        {error}{" "}
        <Link href={`/eventos/${id}`} className="underline">
          Reintentar
        </Link>
      </Alert>
    );
  }

  const sessions = [...(event.sessions ?? [])].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.order - b.order,
  );
  const page = Number(first(query.page));
  const filters = {
    sessionId: first(query.sessionId),
    q: first(query.q).trim(),
    includeDuplicates: first(query.duplicados) === "1",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };

  return (
    <div className="space-y-5">
      <Link
        href="/eventos"
        className="inline-flex items-center gap-1 text-sm text-accent-strong hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Eventos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-navy">{event.name}</h1>
            <Badge tone={event.active ? "green" : "gray"}>
              {event.active ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {formatRange(event.startDate, event.endDate)}
            {event.location && ` · ${event.location}`}
          </p>
          {event.description && (
            <p className="mt-2 max-w-3xl text-sm whitespace-pre-line">{event.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/eventos/${event.id}/editar`} className={button("secondary")}>
            <Pencil aria-hidden className="size-4" />
            Editar
          </Link>
          <CopyEvent id={event.id} name={event.name} />
          {/* Enlace nativo: es una descarga, no una navegación del router. */}
          <a href={`/api/events/${event.id}/export`} className={button()}>
            <Download aria-hidden className="size-4" />
            Descargar consolidado (.xlsx)
          </a>
        </div>
      </div>

      {first(query.errorExport) && (
        <Alert>No fue posible generar el archivo. Intente nuevamente.</Alert>
      )}

      <nav aria-label="Secciones del evento" className="flex gap-1 border-b border-slate-300">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/eventos/${event.id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-accent text-navy"
                : "border-transparent text-slate-600 hover:text-navy"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "sesiones" && <SessionsPanel eventId={event.id} sessions={sessions} />}
      {tab === "asistentes" && (
        <Suspense key={JSON.stringify(filters)} fallback={<Loading label="Cargando asistentes…" />}>
          <AttendeesPanel eventId={event.id} sessions={sessions} filters={filters} />
        </Suspense>
      )}
      {tab === "resumen" && (
        <Suspense fallback={<Loading label="Cargando resumen…" />}>
          <StatsPanel eventId={event.id} />
        </Suspense>
      )}
    </div>
  );
}
