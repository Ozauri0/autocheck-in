import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-navy">No encontrado</h1>
      <p className="mt-2 text-slate-600">La página o el registro que busca no existe.</p>
      <Link href="/eventos" className="mt-6 inline-block text-accent-strong underline">
        Volver a eventos
      </Link>
    </main>
  );
}
