import Link from "next/link";

/**
 * Nav compartida por las páginas de `/admin`.
 *
 * Antes cada página repetía a mano su propio par de enlaces cruzados
 * (`noticia` ↔ `semanal`). Con el menú (`/admin`) y el canal de WhatsApp
 * (`/admin/canal`) sumados, mantener la lista duplicada en cuatro archivos ya
 * pesaba más que extraerla una sola vez.
 */

const PAGINAS = [
  { id: "inicio", href: "/admin", label: "Inicio" },
  { id: "noticia", href: "/admin/noticia", label: "Noticias" },
  { id: "semanal", href: "/admin/semanal", label: "Semanal" },
  { id: "canal", href: "/admin/canal", label: "Canal" },
  { id: "video", href: "/admin/video", label: "Videos" },
] as const;

export type PaginaAdmin = (typeof PAGINAS)[number]["id"];

const CLASE_ENLACE =
  "rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95";

export function AdminNav({ activa }: { activa: PaginaAdmin }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {PAGINAS.filter((pagina) => pagina.id !== activa).map((pagina) => (
        <Link key={pagina.id} href={pagina.href} className={CLASE_ENLACE}>
          {pagina.label}
        </Link>
      ))}
      <form method="POST" action="/api/admin/logout">
        <button type="submit" className={CLASE_ENLACE}>
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
