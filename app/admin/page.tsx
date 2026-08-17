import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Logo } from "@/components/Logo";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";

export const metadata: Metadata = {
  title: "Admin — La Tasa",
};

const SECCIONES = [
  {
    href: "/admin/noticia",
    titulo: "Publicar noticia",
    descripcion: "Artículo externo o contenido propio, en post, carrusel o Reel.",
  },
  {
    href: "/admin/semanal",
    titulo: "Reporte semanal",
    descripcion: "Cómo se movieron las tasas en los últimos 7 días.",
  },
  {
    href: "/admin/canal",
    titulo: "Enviar al canal",
    descripcion: "Arma el mensaje de WhatsApp a partir de un post ya publicado.",
  },
] as const;

export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            La <span className="text-accent">Tasa</span>
          </h1>
        </div>
        <AdminNav activa="inicio" />
      </header>

      <div className="flex flex-col gap-3">
        {SECCIONES.map((seccion) => (
          <Link
            key={seccion.href}
            href={seccion.href}
            className="flex flex-col gap-1 rounded-2xl border border-border-soft bg-surface px-4 py-4 transition active:scale-[0.98]"
          >
            <h2 className="text-base font-semibold">{seccion.titulo}</h2>
            <p className="text-sm text-muted">{seccion.descripcion}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
