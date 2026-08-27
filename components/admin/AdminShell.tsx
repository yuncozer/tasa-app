"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import {
  ENLACES_ADMIN,
  ENLACES_SUPERIORES,
  NAV_ADMIN,
  type EnlaceAdmin,
} from "@/components/admin/nav-admin";

/**
 * Chrome persistente de `/admin`: sidebar en desktop, barra + tira de
 * navegación horizontal en móvil. Vive en `app/admin/(dashboard)/layout.tsx`
 * y envuelve cada página, que ya no necesita repetir cabecera ni nav propia.
 *
 * Es "use client" solo por `usePathname()` — resaltar la sección activa es
 * lo único que necesita el navegador; los enlaces son `<Link>` normales y
 * navegan igual con JavaScript desactivado. El logout sigue siendo un
 * `<form method="POST">` real por el mismo motivo.
 *
 * Portabilidad: si este panel se separa a un proyecto de "gestor de redes"
 * aparte, este archivo más `nav-admin.ts` son los dos que hay que copiar —
 * ninguna página conoce su propia posición en la nav.
 */
function esActivo(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function tituloActivo(pathname: string): string {
  const enlace = TODOS.find((e) => esActivo(pathname, e.href));
  return enlace?.label ?? "Admin";
}

/** En el orden en que se muestran: los sueltos de arriba y luego los grupos. */
const TODOS: EnlaceAdmin[] = [...ENLACES_SUPERIORES, ...ENLACES_ADMIN];

const CLASE_ITEM_SIDEBAR =
  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]";
const CLASE_ITEM_ACTIVO = "bg-accent/15 text-accent";
const CLASE_ITEM_NORMAL = "text-muted";

function ItemSidebar({ enlace, activo }: { enlace: EnlaceAdmin; activo: boolean }) {
  const Icon = enlace.icon;
  return (
    <Link
      href={enlace.href}
      aria-current={activo ? "page" : undefined}
      className={`${CLASE_ITEM_SIDEBAR} ${activo ? CLASE_ITEM_ACTIVO : CLASE_ITEM_NORMAL}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{enlace.label}</span>
    </Link>
  );
}

function BotonLogout({ compacto }: { compacto?: boolean }) {
  return (
    <form method="POST" action="/api/admin/logout">
      <button
        type="submit"
        className={
          compacto
            ? "flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-surface text-muted transition active:scale-95"
            : "flex w-full items-center gap-2.5 rounded-xl border border-border-soft px-3 py-2.5 text-sm font-medium text-muted transition active:scale-[0.98]"
        }
        aria-label="Cerrar sesión"
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0" />
        {!compacto && <span>Cerrar sesión</span>}
      </button>
    </form>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activoMovilRef = useRef<HTMLAnchorElement>(null);

  // La tira de móvil no cabe entera: sin esto, entrar directo a una sección
  // que no sea de las primeras (p. ej. desde el login, que manda a
  // "/admin/noticia") deja su propio pill activo fuera de la vista, cortado
  // en el borde — el usuario ve la nav pero no dónde está parado en ella.
  useEffect(() => {
    activoMovilRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <div className="lg:flex lg:min-h-svh">
      {/* Sidebar de escritorio: fija, con scroll propio si la nav crece más
          que la pantalla. Oculta por completo en móvil, no solo colapsada,
          para no pagar su ancho en el layout de una columna. */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-border-soft bg-surface px-4 py-6 lg:flex">
        <div className="flex flex-col gap-6">
          <Link href="/admin" className="flex items-center gap-2.5 px-1">
            <Logo className="h-7 w-7 shrink-0 text-accent" />
            <span className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-tight">
                La <span className="text-accent">Tasa</span>
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Admin</span>
            </span>
          </Link>

          <nav aria-label="Secciones de admin" className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              {ENLACES_SUPERIORES.map((enlace) => (
                <ItemSidebar key={enlace.href} enlace={enlace} activo={esActivo(pathname, enlace.href)} />
              ))}
            </div>
            {NAV_ADMIN.map((grupo) => (
              <div key={grupo.id} className="flex flex-col gap-1">
                <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {grupo.titulo}
                </h2>
                {grupo.enlaces.map((enlace) => (
                  <ItemSidebar key={enlace.href} enlace={enlace} activo={esActivo(pathname, enlace.href)} />
                ))}
              </div>
            ))}
          </nav>
        </div>

        <BotonLogout />
      </aside>

      <div className="flex flex-1 flex-col lg:min-w-0">
        {/* Barra superior de móvil: identidad + sección activa + logout.
            Sticky y angosta para no comerse pantalla mientras se llena un
            formulario largo con el teclado abierto. */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-soft bg-surface px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:hidden">
          <Link href="/admin" className="flex min-w-0 items-center gap-2">
            <Logo className="h-6 w-6 shrink-0 text-accent" />
            <span className="truncate text-sm font-semibold leading-none">{tituloActivo(pathname)}</span>
          </Link>
          <BotonLogout compacto />
        </header>

        {/* Tira de navegación de móvil: scroll horizontal, no sticky, para
            que se vaya con el contenido y no reste espacio permanente. */}
        <nav
          aria-label="Secciones de admin"
          className="flex gap-2 overflow-x-auto border-b border-border-soft bg-surface px-4 py-2.5 lg:hidden"
        >
          {TODOS.map((enlace) => {
            const Icon = enlace.icon;
            const activo = esActivo(pathname, enlace.href);
            return (
              <Link
                key={enlace.href}
                href={enlace.href}
                ref={activo ? activoMovilRef : undefined}
                aria-current={activo ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${activo
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-soft bg-surface text-muted"
                  }`}
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                {enlace.label}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
