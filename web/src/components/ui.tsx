import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-accent-strong text-white hover:bg-navy-light",
  secondary: "border border-slate-300 bg-white text-navy hover:bg-slate-100",
  danger: "bg-red-700 text-white hover:bg-red-800",
  ghost: "text-navy hover:bg-slate-200",
  ghostDanger: "text-red-700 hover:bg-red-50",
};

export function button(variant: keyof typeof variants = "primary", size: "md" | "sm" = "md") {
  return `${buttonBase} ${variants[variant]} ${size === "sm" ? "px-2.5 py-1.5" : "px-4 py-2"}`;
}

export const card = "rounded-lg border border-slate-200 bg-white shadow-sm";
export const input =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm aria-invalid:border-red-600";
export const th = "px-4 py-3 text-left font-semibold whitespace-nowrap";
export const td = "px-4 py-3 align-top";
export const thead = "border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600";

export function Badge({
  tone,
  children,
}: {
  tone: "green" | "gray" | "amber";
  children: React.ReactNode;
}) {
  const tones = {
    green: "bg-green-100 text-green-800",
    gray: "bg-slate-200 text-slate-700",
    amber: "bg-amber-100 text-amber-900",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={`${card} px-6 py-12 text-center`}>
      <Inbox aria-hidden className="mx-auto size-8 text-slate-400" />
      <p className="mt-3 font-medium text-navy">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-600">{children}</div>}
    </div>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-slate-600">
      <Loader2 aria-hidden className="size-5 animate-spin" />
      {label}
    </div>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-navy">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Atributos comunes de un control enlazado a <Field>. */
export function fieldProps(name: string, error?: string) {
  return {
    id: name,
    name,
    className: input,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${name}-error` : undefined,
  };
}
