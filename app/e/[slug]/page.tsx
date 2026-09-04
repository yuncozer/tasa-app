import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { registrarAtajo } from "@/lib/analiticas-web";
import { leerEnlacePost } from "@/lib/enlaces";
import { perfilInstagram } from "@/lib/atajos";
import { urlImagen } from "@/lib/providers/cloudinary";
import { esUrlValida } from "@/lib/validar-url";

/**
 * `/e/<slug>`: el atajo de un post concreto de Instagram.
 *
 * Es lo que va en el mensaje del canal de WhatsApp en lugar del permalink
 * crudo, para todo lo que no sea el post diario de tasas ni el de La Parada
 * —esos tienen `/hoy` y `/laparada`, que además resuelven siempre al más
 * reciente de su serie—. Dos cosas se ganan con el rodeo:
 *
 * - **La vista previa.** Un permalink de Instagram pegado en WhatsApp se topa
 *   con el muro de login y la tarjeta sale vacía. Por eso esto es una página
 *   con `<meta refresh>` y no una redirección 307: el rastreador que arma la
 *   tarjeta no ejecuta el refresh, así que se queda con el `og:image` de aquí;
 *   la persona ve un parpadeo. Es el mismo mecanismo de `/hoy`, y el motivo
 *   por el que aquel tampoco es un `redirects()` de `next.config.ts`.
 * - **El clic se cuenta.** De todo lo que se mandaba al canal que no fuera el
 *   post diario no se sabía nada.
 *
 * Antes se llamaba `/p/<slug>` y nació al revés: el slug se escribía dentro
 * del caption **antes** de publicar, cuando Instagram todavía no ha asignado
 * el permalink. Aquel pie de enlaces se retiró de los captions de Instagram
 * —allí no son clicables— y la ruta se quedó sin uso hasta ahora. `next.config.ts`
 * mantiene `/p/:slug` redirigiendo aquí: cuatro captions publicados en agosto
 * llevan esa forma escrita y no se pueden reescribir desde el código.
 */

export const dynamic = "force-dynamic";

/**
 * El destino y su tarjeta, en **una sola** lectura.
 *
 * `generateMetadata` y el componente la llaman los dos, así que sin el `cache`
 * de React serían **dos viajes a Supabase por cada apertura del enlace** — y
 * este enlace se abre desde un chat, o sea muchas veces seguidas. `cache`
 * memoriza por argumento dentro de una misma petición, que es exactamente
 * este caso.
 */
const enlace = cache(async (slug: string): Promise<{ destino: string; imagen: string | null }> => {
  try {
    const fila = await leerEnlacePost(slug);
    if (fila && esUrlValida(fila.url)) {
      return { destino: fila.url, imagen: fila.imagen };
    }
  } catch {
    // Un Supabase caído no puede dejar sin destino a un enlace ya compartido.
  }

  // Sin variable de entorno de respaldo, al contrario que `/hoy`: no tiene
  // sentido una para un slug que no existía hasta que se compartió ese post.
  return { destino: perfilInstagram(), imagen: null };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { destino, imagen } = await enlace(slug);

  return {
    title: "La Tasa",
    description: "Toca para ver la publicación completa en Instagram.",
    openGraph: {
      type: "article",
      title: "La Tasa",
      description: "Toca para ver la publicación completa en Instagram.",
      url: destino,
      // La miniatura se copió a Cloudinary al compartir; la de Instagram
      // caduca en días y dejaría la tarjeta rota (ver `lib/canal-whatsapp.ts`).
      ...(imagen ? { images: [{ url: urlImagen(imagen) }] } : {}),
    },
    twitter: { card: imagen ? "summary_large_image" : "summary" },
  };
}

export default async function EnlacePost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { destino } = await enlace(slug);

  // El clic se anota aquí, en el servidor, y no al hidratar: el `<meta
  // refresh>` de abajo dispara de inmediato y un evento del navegador llegaría
  // tarde la mitad de las veces. `registrarAtajo` descarta a los rastreadores
  // —el de WhatsApp pide esta página cada vez que alguien pega el enlace— y
  // nunca lanza. El slug viaja en `ruta` para poder desglosar por post; la
  // etiqueta agregada sigue en `detalle`, que es lo que lee el panel.
  const cabeceras = await headers();
  await registrarAtajo("/e", {
    userAgent: cabeceras.get("user-agent"),
    referer: cabeceras.get("referer"),
    ruta: `/e/${slug}`,
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
