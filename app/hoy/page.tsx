import type { Metadata } from "next";
import { headers } from "next/headers";
import { registrarAtajo } from "@/lib/analiticas-web";
import { destinoDeHoy } from "@/lib/enlaces";

/**
 * `/hoy`: el enlace estable que se comparte para llevar al carrusel de tasas
 * del día. A dónde apunta lo anota el propio cron al publicar (ver
 * `lib/enlaces.ts`).
 *
 * Es una **página** y no una redirección 307, y ese es todo el punto del
 * diseño. Este enlace se pega en WhatsApp, y el rastreador de WhatsApp sigue
 * la redirección hasta Instagram, donde se encuentra el muro de login: sin
 * `og:image` ni `og:title`, la tarjeta sale vacía. La vista previa tiene que
 * salir de este dominio, así que aquí se declaran las etiquetas Open Graph con
 * la imagen del post del día —la misma que se publicó, no una compuesta
 * aparte— y el visitante real se manda a Instagram al abrir.
 *
 * El rastreador no ejecuta la redirección del cuerpo, de modo que se queda con
 * la tarjeta; la persona no ve más que un parpadeo.
 */

// El destino cambia dos veces al día, así que nada de esto se puede
// pregenerar ni cachear (ver también la cabecera `no-store` en `next.config.ts`).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const destino = await destinoDeHoy();
  const siteUrl = process.env.SITE_URL;

  return {
    title: "Tasas de hoy — La Tasa",
    description:
      "Dólar BCV, dólar Binance P2P, euro BCV y peso colombiano en bolívares. Toca para ver el post completo.",
    openGraph: {
      type: "article",
      title: "Tasas de hoy — La Tasa",
      description: "Las tasas del día en bolívares y en pesos.",
      url: destino,
      // La imagen la sirve la misma ruta que publica el post en Instagram. Si
      // no hay `SITE_URL` no se declara ninguna: una `og:image` rota da peor
      // tarjeta que ninguna.
      images: siteUrl ? [{ url: `${siteUrl}/api/og/instagram-post`, width: 1080, height: 1080 }] : undefined,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function Hoy() {
  const destino = await destinoDeHoy();

  // El clic se anota aquí, en el servidor, y no al hidratar: el `<meta
  // refresh>` de abajo dispara de inmediato y un evento del navegador
  // llegaría tarde la mitad de las veces. `registrarAtajo` descarta a los
  // rastreadores —el de WhatsApp pide esta página cada vez que alguien pega
  // el enlace— y nunca lanza.
  const cabeceras = await headers();
  await registrarAtajo("/hoy", {
    userAgent: cabeceras.get("user-agent"),
    referer: cabeceras.get("referer"),
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-4 text-center sm:px-6">
      {/*
        La redirección va en un `<meta http-equiv="refresh">` y no en un script
        ni en `redirect()` del servidor: el rastreador no la sigue —se queda con
        las etiquetas de arriba, que es lo que hace la tarjeta— y en cambio
        funciona en cualquier navegador aunque tenga JavaScript desactivado.
      */}
      <meta httpEquiv="refresh" content={`0; url=${destino}`} />
      <p className="text-sm text-muted">Abriendo el post de hoy en Instagram…</p>
      {/*
        Visible a propósito: si la redirección no corre —un navegador dentro de
        otra app, una extensión que la bloquea— esto es lo único que queda.
      */}
      <a
        href={destino}
        className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-background active:scale-95"
      >
        Abrir en Instagram
      </a>
    </main>
  );
}
