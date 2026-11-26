import { LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions";

// El panel depende de la sesión: nada se prerenderiza.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="border-b-4 border-accent bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/eventos" className="font-semibold">
            Auto check-in <span className="text-sky-300">UCT</span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-navy-light"
            >
              <LogOut aria-hidden className="size-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
