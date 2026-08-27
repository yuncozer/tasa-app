"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import {
  ENLACES_ADMIN,
  ENLACES_SUPERIORES,
  NAV_ADMIN,
  type EnlaceAdmin,
} from "@/components/admin/nav-admin";

/**
 * Chrome persistente de `/admin`: sidebar fija en escritorio y, en móvil, la
 * misma sidebar servida como cajón desde la hamburguesa del header.
 * Vive en `app/admin/(dashboard)/layout.tsx` y envuelve cada página, que ya
 * no necesita repetir cabecera ni nav propia.
 *
 * **En móvil la nav era una tira de píldoras con scroll horizontal, y se
 * cambió por el cajón.** Con nueve secciones, la tira no cabía entera: había
 * que arrastrarla para descubrir qué más hay, no dejaba ver los grupos
 * ("Publicar", "Reportes y difusión", "Herramientas") y se comía una franja
 * de pantalla en cada pantalla del panel, justo donde se llenan formularios
 * largos. El cajón enseña la lista completa y agrupada cuando se pide, y no
 * ocupa nada cuando no.
 *
 * La lista es **la misma en los dos sitios** (`Secciones`), no dos copias que
 * se desincronizan: lo único que cambia es el envoltorio.
 *
 * Es "use client" por `usePathname()` y por el estado del cajón. Los enlaces
 * siguen siendo `<Link>` normales y el logout un `<form method="POST">` real,
 * así que navegar y cerrar sesión funcionan igual sin JavaScript; lo único
 * que se pierde entonces es poder abrir el cajón, y para eso está el logo del
 * header, que lleva a `/admin` y ahí están todas las secciones en tarjetas.
 *
 * Portabilidad: si este panel se separa a un proyecto de "gestor de redes"
 * aparte, este archivo más `nav-admin.ts` son los dos que hay que copiar —
 * ninguna página conoce su propia posición en la nav.
 */
function esActivo(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** En el orden en que se muestran: los sueltos de arriba y luego los grupos. */
const TODOS: EnlaceAdmin[] = [...ENLACES_SUPERIORES, ...ENLACES_ADMIN];

function tituloActivo(pathname: string): string {
  const enlace = TODOS.find((e) => esActivo(pathname, e.href));
  return enlace?.label ?? "Admin";
}

const CLASE_ITEM_SIDEBAR =
  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]";
const CLASE_ITEM_ACTIVO = "bg-accent/15 text-accent";
const CLASE_ITEM_NORMAL = "text-muted";

function ItemSidebar({
  enlace,
  activo,
  alNavegar,
}: {
  enlace: EnlaceAdmin;
  activo: boolean;
  alNavegar?: () => void;
}) {
  const Icon = enlace.icon;
  return (
    <Link
      href={enlace.href}
      onClick={alNavegar}
      aria-current={activo ? "page" : undefined}
      className={`${CLASE_ITEM_SIDEBAR} ${activo ? CLASE_ITEM_ACTIVO : CLASE_ITEM_NORMAL}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{enlace.label}</span>
    </Link>
  );
}

/** La lista de secciones, idéntica en la sidebar de escritorio y en el cajón. */
function Secciones({ pathname, alNavegar }: { pathname: string; alNavegar?: () => void }) {
  return (
    <nav aria-label="Secciones de admin" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        {ENLACES_SUPERIORES.map((enlace) => (
          <ItemSidebar
            key={enlace.href}
            enlace={enlace}
            activo={esActivo(pathname, enlace.href)}
            alNavegar={alNavegar}
          />
        ))}
      </div>
      {NAV_ADMIN.map((grupo) => (
        <div key={grupo.id} className="flex flex-col gap-1">
          <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {grupo.titulo}
          </h2>
          {grupo.enlaces.map((enlace) => (
            <ItemSidebar
              key={enlace.href}
              enlace={enlace}
              activo={esActivo(pathname, enlace.href)}
              alNavegar={alNavegar}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function Marca({ alNavegar }: { alNavegar?: () => void }) {
  return (
    <Link href="/admin" onClick={alNavegar} className="flex items-center gap-2.5 px-1">
      <Logo className="h-7 w-7 shrink-0 text-accent" />
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight">
          La <span className="text-accent">Tasa</span>
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Admin</span>
      </span>
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
  const [abierto, setAbierto] = useState(false);

  const cerrar = useCallback(() => setAbierto(false), []);

  // Navegar cierra el cajón, y eso lo hace cada enlace al pulsarse
  // (`alNavegar`), no un efecto sobre el `pathname`: cerrar desde un efecto
  // es llamar a `setState` dentro de uno, el patrón que este proyecto evita
  // —y que el linter rechaza— por el mismo motivo que existe
  // `useSyncExternalStore` en la calculadora.

  useEffect(() => {
    if (!abierto) return;

    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", alPulsar);

    // Sin esto, arrastrar sobre el cajón desplaza la página de detrás y al
    // cerrarlo se ha perdido el sitio donde se estaba.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, cerrar]);

  return (
    <div className="lg:flex lg:min-h-svh">
      {/* Sidebar de escritorio: fija, con scroll propio si la nav crece más
          que la pantalla. Oculta por completo en móvil, no solo colapsada,
          para no pagar su ancho en el layout de una columna. */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col justify-between overflow-y-auto border-r border-border-soft bg-surface px-4 py-6 lg:flex">
        <div className="flex flex-col gap-6">
          <Marca />
          <Secciones pathname={pathname} />
        </div>

        <BotonLogout />
      </aside>

      <div className="flex flex-1 flex-col lg:min-w-0">
        {/* Barra superior de móvil: hamburguesa + sección activa + logout.
            Sticky y angosta para no comerse pantalla mientras se llena un
            formulario largo con el teclado abierto. */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-soft bg-surface px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setAbierto(true)}
              aria-label="Abrir menú de secciones"
              aria-expanded={abierto}
              aria-controls="cajon-admin"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-surface text-muted transition active:scale-95"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <Link href="/admin" className="flex min-w-0 items-center gap-2">
              <Logo className="h-6 w-6 shrink-0 text-accent" />
              <span className="truncate text-sm font-semibold leading-none">
                {tituloActivo(pathname)}
              </span>
            </Link>
          </div>
          <BotonLogout compacto />
        </header>

        {/* El cajón se queda montado y se mueve con `translate`, para que
            entre y salga deslizándose; `inert` mientras está cerrado lo saca
            del foco y de los lectores de pantalla, de modo que su copia de la
            nav no se recorre dos veces con el teclado. */}
        <div
          className={`fixed inset-0 z-20 lg:hidden ${abierto ? "" : "pointer-events-none"}`}
          inert={!abierto}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar menú"
            onClick={cerrar}
            className={`absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity ${
              abierto ? "opacity-100" : "opacity-0"
            }`}
          />

          <div
            id="cajon-admin"
            role="dialog"
            aria-modal="true"
            aria-label="Secciones de admin"
            className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col justify-between overflow-y-auto border-r border-border-soft bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] transition-transform duration-200 ${
              abierto ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between gap-2">
                <Marca alNavegar={cerrar} />
                <button
                  type="button"
                  onClick={cerrar}
                  aria-label="Cerrar menú"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-soft text-muted transition active:scale-95"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>

              <Secciones pathname={pathname} alNavegar={cerrar} />
            </div>

            <div className="pt-6">
              <BotonLogout />
            </div>
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
