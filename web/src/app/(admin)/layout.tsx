import { LogOut, QrCode, Users } from "lucide-react";
import Image from "next/image";
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
      <header className="border-b-4 border-uct-yellow bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href={isAdmin ? "/eventos" : "/escanear"}
            className="flex min-w-0 items-center gap-3"
          >
            <Image
              src="/brand/uct-isotipo.png"
              alt=""
              width={36}
              height={36}
              priority
              className="size-9 shrink-0 rounded-full"
            />
            <span className="min-w-0 leading-tight">
              <span className="block font-semibold whitespace-nowrap">Auto check-in</span>
              <span className="block truncate text-xs text-white/75">UCT · CINAP</span>
            </span>
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
              <span className="max-[420px]:sr-only">Escanear QR</span>
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
