import type { Metadata } from "next";
import Image from "next/image";
import { nextPath } from "@/lib/next-path";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expirada?: string; next?: string }>;
}) {
  const { expirada, next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-md rounded-lg border-t-4 border-uct-yellow bg-white p-6 shadow-xl">
        <Image
          src="/brand/uct-cinap.png"
          alt="Universidad Católica de Temuco · CINAP, Centro de Innovación en Aprendizaje, Docencia y Tecnología Educativa"
          width={1122}
          height={209}
          priority
          className="h-auto w-full"
        />
        <h1 className="mt-6 text-xl font-semibold text-navy">Auto check-in</h1>
        <p className="mt-1 text-sm text-slate-600">Registro de asistencia por QR</p>
        {expirada && (
          <p role="status" className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Su sesión expiró. Ingrese nuevamente.
          </p>
        )}
        <LoginForm next={nextPath(next)} />
      </div>
    </main>
  );
}
