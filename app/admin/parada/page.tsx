import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Logo } from "@/components/Logo";
import { ParadaPanel } from "@/components/ParadaPanel";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { leerParadaPendiente } from "@/lib/parada";
import { previewNewsPost } from "@/lib/publish-news";

export const metadata: Metadata = {
  title: "Dólar en La Parada — La Tasa",
};

/**
 * Borrador del post "Dólar en La Parada" que detectó
 * `app/api/cron/vigilar-parada/route.ts`, listo para revisar y publicar con
 * un toque. No tiene formulario de URL como `/admin/noticia`: la fuente es
 * siempre la misma columna de lanacionweb.com, y lo único que decide el
 * admin es si publicar el caption sugerido tal cual o editarlo antes.
 *
 * La imagen se previsualiza volviendo a scrapear el artículo
 * (`previewNewsPost`, la misma función que arma el post de verdad al
 * publicar) en vez de mostrar la foto cruda que guardó el cron: así lo que
 * se ve es lo que saldría, marco de marca incluido. Si el portal cambió o
 * cayó desde que se detectó, el error sale aquí en vez de al publicar.
 */
export default async function AdminParadaPage() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  const pendiente = await leerParadaPendiente().catch(() => null);
  const borrador = pendiente && !pendiente.publicado ? pendiente : null;

  let imagenUrl: string | null = null;
  let errorPreview: string | null = null;
  if (borrador) {
    try {
      const previa = await previewNewsPost(borrador.url);
      imagenUrl = previa.imageUrl;
    } catch (error) {
      errorPreview = error instanceof Error ? error.message : "No se pudo previsualizar el artículo";
    }
  }

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

      <ParadaPanel borrador={borrador} imagenUrl={imagenUrl} errorPreview={errorPreview} />
    </main>
  );
}
