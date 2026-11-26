import { api } from "@/lib/api";
import { load } from "@/lib/load";
import { Alert, card, EmptyState } from "./ui";

export async function StatsPanel({ eventId }: { eventId: string }) {
  const { data, error } = await load(() => api.stats(eventId));
  if (error !== undefined) return <Alert>{error}</Alert>;

  const sessions = data.sessions ?? [];
  const max = Math.max(1, ...sessions.map((s) => s.count));
  const totals = [
    { label: "Check-ins totales", value: data.totalCheckins },
    { label: "Asistentes únicos", value: data.uniqueAttendees },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        {totals.map((t) => (
          <div key={t.label} className={`${card} p-5`}>
            <dt className="text-sm text-slate-600">{t.label}</dt>
            <dd className="mt-1 text-3xl font-semibold text-navy">
              {t.value.toLocaleString("es-CL")}
            </dd>
          </div>
        ))}
      </dl>

      {sessions.length === 0 ? (
        <EmptyState title="Sin sesiones para resumir" />
      ) : (
        <section className={`${card} p-5`}>
          <h2 className="font-semibold text-navy">Asistencia por sesión</h2>
          <p className="text-xs text-slate-500">Sin contar duplicados</p>
          <ul className="mt-4 space-y-3">
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <div className="flex justify-between gap-3 text-sm">
                  <span>
                    {s.name}
                    {s.room && <span className="text-slate-500"> — {s.room}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </div>
                <div aria-hidden className="mt-1 h-2.5 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(s.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
