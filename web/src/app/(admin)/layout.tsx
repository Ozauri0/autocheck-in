import { LogOut, QrCode, Users } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import { currentRole } from "@/lib/roles";

// El panel depende de la sesión: nada se prerenderiza.
export const dynamic = "force-dynamic";

const navLink =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-navy-light";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = (await currentRole()) === "admin";
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
          <Link href={isAdmin ? "/eventos" : "/escanear"} className="font-semibold">
            Auto check-in <span className="text-sky-300">UCT</span>
          </Link>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link href="/usuarios" className={navLink}>
                <Users aria-hidden className="size-4" />
                <span className="max-sm:sr-only">Usuarios</span>
              </Link>
            )}
            <Link href="/escanear" className={navLink}>
              <QrCode aria-hidden className="size-4" />
              Escanear QR
            </Link>
            <form action={logoutAction}>
              <button type="submit" className={navLink}>
                <LogOut aria-hidden className="size-4" />
                {/* En celular solo el icono; el texto sigue para lectores de pantalla. */}
                <span className="max-sm:sr-only">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
