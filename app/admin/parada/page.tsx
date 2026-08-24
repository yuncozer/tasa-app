import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Logo } from "@/components/Logo";
import { ParadaPanel } from "@/components/ParadaPanel";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { leerParadaPendiente } from "@/lib/parada";

export const metadata: Metadata = {
  title: "Dólar en La Parada — La Tasa",
};

/**
 * Borrador del post "Dólar en La Parada" que detectó
 * `app/api/cron/vigilar-parada/route.ts`, listo para revisar y publicar con
 * un toque. No tiene formulario de URL como `/admin/noticia`: la fuente es
 * siempre la misma columna de lanacionweb.com.
 *
 * La imagen la sirve `/api/og/instagram-post-parada`, una plantilla propia
 * (no el marco genérico de noticia) que lee el borrador directo de
 * Supabase — no hace falta pasarle nada por props aquí, el `<img>` del panel
 * apunta a esa ruta y ella misma resuelve el estado actual.
 */
export default async function AdminParadaPage() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  const pendiente = await leerParadaPendiente().catch(() => null);
  const borrador = pendiente && !pendiente.publicado ? pendiente : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            Dólar en <span className="text-accent">La Parada</span>
          </h1>
        </div>
        <AdminNav activa="parada" />
      </header>

      <ParadaPanel borrador={borrador} />
    </main>
  );
}
