import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expirada?: string }>;
}) {
  const { expirada } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border-t-4 border-accent bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-navy">Auto check-in UCT</h1>
        <p className="mt-1 text-sm text-slate-600">
          Universidad Católica de Temuco · Administración
        </p>
        {expirada && (
          <p role="status" className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Su sesión expiró. Ingrese nuevamente.
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
