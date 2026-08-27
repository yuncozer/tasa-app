import type { Metadata } from "next";
import { headers } from "next/headers";
import { registrarAtajo } from "@/lib/analiticas-web";
import { destinoDePost } from "@/lib/enlaces";

/**
 * `/p/<slug>`: el atajo de un post de noticia, mismo mecanismo que `/hoy`
 * pero uno por post en vez de uno fijo —en un mismo día puede salir más de
 * una noticia—. El slug se genera y se escribe en el caption **antes** de
 * publicar (el permalink real de Instagram no existe todavía en ese
 * momento); el propio flujo de publicación anota después a dónde quedó
 * apuntando, vía `guardarEnlace` en `lib/publish-news.ts`.
 *
 * Es una página con `<meta refresh>` y no una redirección 307, por el mismo
 * motivo que `/hoy`: este enlace viaja en el mensaje del canal de WhatsApp, y
 * el rastreador que arma la vista previa sigue la redirección hasta
 * Instagram, donde se encuentra el muro de login sin `og:image`. La tarjeta
 * tiene que salir de este dominio.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const destino = await destinoDePost(slug);

  return {
    title: "La Tasa",
    description: "Toca para ver la publicación completa en Instagram.",
    openGraph: {
      type: "article",
      title: "La Tasa",
      description: "Toca para ver la publicación completa en Instagram.",
      url: destino,
    },
    twitter: { card: "summary" },
  };
}

export default async function EnlacePost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destino = await destinoDePost(slug);

  // El clic se anota aquí, en el servidor, y no al hidratar: el `<meta
  // refresh>` de abajo dispara de inmediato y un evento del navegador
  // llegaría tarde la mitad de las veces. `registrarAtajo` descarta a los
  // rastreadores —el de WhatsApp pide esta página cada vez que alguien pega
  // el enlace— y nunca lanza.
  const cabeceras = await headers();
  await registrarAtajo("/p", {
    userAgent: cabeceras.get("user-agent"),
    referer: cabeceras.get("referer"),
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-4 text-center sm:px-6">
      <meta httpEquiv="refresh" content={`0; url=${destino}`} />
      <p className="text-sm text-muted">Abriendo la publicación en Instagram…</p>
      <a
        href={destino}
        className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-background active:scale-95"
      >
        Abrir en Instagram
      </a>
    </main>
  );
}
