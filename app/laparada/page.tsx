import type { Metadata } from "next";
import { headers } from "next/headers";
import { registrarAtajo } from "@/lib/analiticas-web";
import { destinoDeLaParada } from "@/lib/enlaces";

/**
 * `/laparada`: el enlace estable del post "Dólar en La Parada", con el mismo
 * diseño que `/hoy` y por el mismo motivo — ver `app/hoy/page.tsx` para el
 * porqué completo. En resumen: es una **página**, no una redirección 307,
 * porque este enlace se pega en WhatsApp y su rastreador sigue una
 * redirección de servidor hasta el muro de login de Instagram, donde no hay
 * `og:image`. Las etiquetas Open Graph van aquí, con la imagen que ya generó
 * `/api/og/instagram-post-parada` para el post real — no una recalculada
 * aparte — y el visitante real se manda a Instagram al abrir.
 *
 * A dónde apunta lo anota `app/api/admin/publish-parada/route.ts` justo
 * después de publicar (`lib/enlaces.ts`, misma tabla que usa `/hoy`).
 */

// El destino cambia cada vez que se publica un post nuevo de esta serie, así
// que nada de esto se puede pregenerar (ver también la cabecera `no-store`
// en `next.config.ts`).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const destino = await destinoDeLaParada();
  const siteUrl = process.env.SITE_URL;

  return {
    title: "Dólar en La Parada — La Tasa",
    description: "El cambio informal de dólares en La Parada, Villa del Rosario. Toca para ver el post completo.",
    openGraph: {
      type: "article",
      title: "Dólar en La Parada — La Tasa",
      description: "Cuánto se compra y se vende el dólar en el punto físico de La Parada.",
      url: destino,
      images: siteUrl ? [{ url: `${siteUrl}/api/og/instagram-post-parada`, width: 1080, height: 1080 }] : undefined,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LaParada() {
  const destino = await destinoDeLaParada();

  // El clic se anota aquí, en el servidor, y no al hidratar: el `<meta
  // refresh>` de abajo dispara de inmediato y un evento del navegador
  // llegaría tarde la mitad de las veces. `registrarAtajo` descarta a los
  // rastreadores —el de WhatsApp pide esta página cada vez que alguien pega
  // el enlace— y nunca lanza.
  const cabeceras = await headers();
  await registrarAtajo("/laparada", {
    userAgent: cabeceras.get("user-agent"),
    referer: cabeceras.get("referer"),
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-4 text-center sm:px-6">
      {/* Mismo criterio que `/hoy`: el rastreador no sigue este refresh, así que se queda con las etiquetas de arriba. */}
      <meta httpEquiv="refresh" content={`0; url=${destino}`} />
      <p className="text-sm text-muted">Abriendo el post de La Parada en Instagram…</p>
      <a
        href={destino}
        className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-background active:scale-95"
      >
        Abrir en Instagram
      </a>
    </main>
  );
}
