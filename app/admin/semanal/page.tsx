import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ReporteSemanalPanel } from "@/components/ReporteSemanalPanel";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { buildCaptionSemanal } from "@/lib/caption";
import { getRates } from "@/lib/rates";
import { construirReporteSemanal } from "@/lib/semanal";

export const metadata: Metadata = {
  title: "Reporte semanal — La Tasa",
};

/**
 * Página aparte de `/admin/noticia` y no una pestaña suya: aquella es un
 * formulario con estado propio (switch Post/Reel, subidas, vista previa
 * desactualizada, cola de programadas) y este reporte **no tiene entradas** —se
 * mira y se publica—. Meterlo dentro obligaría a un tercer destino en
 * `PublicarPanel` que no comparte ni un campo con los otros dos.
 *
 * El reporte se construye en el servidor y baja por props, por la misma razón
 * que la cola de `/admin/noticia`: pedirlo desde el cliente obligaría a un
 * `setState` dentro de un efecto, el patrón que el proyecto evita.
 */
export default async function AdminSemanalPage() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  // `construirReporteSemanal` ya degrada sola si Supabase falla: devuelve el
  // reporte sin variaciones en vez de tumbar la página.
  const snapshot = await getRates();
  const reporte = await construirReporteSemanal(snapshot);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            Reporte <span className="text-accent">semanal</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/noticia"
            className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
          >
            Noticias
          </Link>
          <form method="POST" action="/api/admin/logout">
            <button
              type="submit"
              className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      <ReporteSemanalPanel
        rangoTexto={reporte.rangoTexto}
        sinComparacion={reporte.sinComparacion}
        caption={buildCaptionSemanal(reporte)}
      />
    </main>
  );
}
