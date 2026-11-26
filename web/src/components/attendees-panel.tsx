import { Download, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatTimestamp } from "@/lib/dates";
import { load } from "@/lib/load";
import type { Session } from "@/lib/types";
import { Alert, Badge, button, card, EmptyState, input, td, th, thead } from "./ui";

const PAGE_SIZE = 50;

export interface CheckinFilters {
  sessionId: string;
  q: string;
  includeDuplicates: boolean;
  page: number;
}

export async function AttendeesPanel({
  eventId,
  sessions,
  filters,
}: {
  eventId: string;
  sessions: Session[];
  filters: CheckinFilters;
}) {
  const { data, error } = await load(() =>
    api.listCheckins(eventId, { ...filters, limit: PAGE_SIZE }),
  );
  const base = `/eventos/${eventId}`;

  function pageHref(page: number) {
    const params = new URLSearchParams({ tab: "asistentes", page: String(page) });
    if (filters.sessionId) params.set("sessionId", filters.sessionId);
    if (filters.q) params.set("q", filters.q);
    if (filters.includeDuplicates) params.set("duplicados", "1");
    return `${base}?${params}`;
  }

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || PAGE_SIZE))) : 1;

  return (
    <div className="space-y-3">
      <Form
        action={base}
        // La clave reinicia los controles al cambiar los filtros desde la URL.
        key={`${filters.sessionId}|${filters.q}|${filters.includeDuplicates}`}
        className={`${card} flex flex-wrap items-end gap-3 p-4`}
      >
        <input type="hidden" name="tab" value="asistentes" />
        <div className="min-w-48 flex-1">
          <label htmlFor="sessionId" className="mb-1 block text-sm font-medium text-navy">
            Sesión
          </label>
          <select id="sessionId" name="sessionId" defaultValue={filters.sessionId} className={input}>
            <option value="">Todas las sesiones</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.room ? `${s.name} — ${s.room}` : s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-navy">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Nombre, RUT o email"
            className={input}
          />
        </div>
        <label className="flex items-center gap-2 py-2 text-sm">
          <input
            type="checkbox"
            name="duplicados"
            value="1"
            defaultChecked={filters.includeDuplicates}
            className="size-4"
          />
          Incluir duplicados
        </label>
        <button type="submit" className={button("secondary")}>
          <Search aria-hidden className="size-4" />
          Filtrar
        </button>
        {filters.sessionId && (
          <a
            href={`/api/events/${eventId}/export?${new URLSearchParams({ sessionId: filters.sessionId })}`}
            className={button("secondary")}
          >
            <Download aria-hidden className="size-4" />
            Descargar sesión (.xlsx)
          </a>
        )}
      </Form>

      {error !== undefined ? (
        <Alert>
          {error}{" "}
          <Link href={pageHref(filters.page)} className="underline">
            Reintentar
          </Link>
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState title="No hay registros de asistencia">
          {filters.sessionId || filters.q ? (
            <Link href={`${base}?tab=asistentes`} className="text-accent-strong underline">
              Quitar filtros
            </Link>
          ) : data.total > 0 ? (
            <Link href={pageHref(1)} className="text-accent-strong underline">
              Ir a la primera página
            </Link>
          ) : (
            "Aparecerán aquí cuando las tablets sincronicen sus escaneos."
          )}
        </EmptyState>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <caption className="sr-only">Registros de asistencia</caption>
            <thead className={thead}>
              <tr>
                <th className={th}>Fecha y hora</th>
                <th className={th}>Sesión</th>
                <th className={th}>Nombre</th>
                <th className={th}>RUT</th>
                <th className={th}>Email</th>
                <th className={th}>Dispositivo</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {formatTimestamp(c.scannedAt)}
                  </td>
                  <td className={`${td} min-w-40`}>{c.sessionName || "—"}</td>
                  <td className={`${td} min-w-40 font-medium text-navy`}>
                    {c.attendee.name || c.raw}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{c.attendee.rut || "—"}</td>
                  <td className={td}>{c.attendee.email || "—"}</td>
                  <td className={td}>{c.deviceName || c.deviceId || "—"}</td>
                  <td className={td}>
                    {c.duplicate ? (
                      <Badge tone="amber">Duplicado</Badge>
                    ) : (
                      <Badge tone="green">Válido</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <nav
          aria-label="Paginación"
          className="flex flex-wrap items-center justify-between gap-2 text-sm"
        >
          <p className="text-slate-600">
            {data.total} {data.total === 1 ? "registro" : "registros"} · página {data.page} de{" "}
            {totalPages}
          </p>
          <div className="flex gap-2">
            {data.page > 1 && (
              <Link
                href={pageHref(Math.min(data.page - 1, totalPages))}
                className={button("secondary", "sm")}
              >
                Anterior
              </Link>
            )}
            {data.page < totalPages && (
              <Link href={pageHref(data.page + 1)} className={button("secondary", "sm")}>
                Siguiente
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
