import type { NextConfig } from "next";
import { enlaceWhatsapp, perfilInstagram } from "./lib/atajos";

const nextConfig: NextConfig = {
  /**
   * Los atajos del dominio que llevan siempre al mismo sitio. `/hoy` **no**
   * está aquí: su destino cambia dos veces al día y esto se evalúa al
   * compilar, así que vive en `app/hoy/page.tsx`, que además le pone vista
   * previa propia.
   */
  async redirects() {
    const whatsapp = enlaceWhatsapp();

    return [
      {
        source: "/ig",
        destination: perfilInstagram(),
        // 307 y no 301: un permanente se queda cacheado en el navegador para
        // siempre y dejaría sin arreglo un destino equivocado.
        permanent: false,
      },
      // Sin `ENLACE_WHATSAPP` configurado la ruta no existe, en vez de llevar a
      // un número inventado (ver `lib/atajos.ts`).
      ...(whatsapp ? [{ source: "/wa", destination: whatsapp, permanent: false }] : []),
    ];
  },

  async headers() {
    return [
      {
        // El destino de este atajo cambia cada pocas horas: si la CDN se queda
        // con una copia, el enlace que se comparte por la tarde sigue llevando
        // al post de la mañana.
        source: "/hoy",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // Mismo motivo que `/hoy`: el slug se escribe en el caption antes de
        // publicar, y el destino real se anota un instante después. Una copia
        // en la CDN de esa primera respuesta (el respaldo al perfil) se
        // quedaría sirviéndola aunque el post ya esté anotado.
        source: "/p/:slug",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // El destino cambia cada vez que se publica un post nuevo de "Dólar
        // en La Parada" — mismo motivo que `/hoy`.
        source: "/laparada",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // La portada es donde de verdad llega el tráfico, y Next la marca como
        // dinámica —los proveedores se consultan con `no-store`—, así que sin
        // esto cada visita despertaría una función y repetiría la ronda de
        // llamadas al BCV, a Binance y a datos.gov.co.
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        // El historial sale de `historico_tasas`, que solo cambia cuando corre
        // el cron: dos veces al día. Sin esta cabecera cada visita —y cada
        // cambio de pestaña o de tasa, que son navegaciones nuevas— sería un
        // viaje a Supabase, porque `lib/historico.ts` consulta con `no-store` y
        // eso vuelve dinámica la página. Es la misma consulta-por-visitante que
        // el proyecto ya evita en la portada, y se resuelve igual: desde aquí,
        // porque Next fuerza `no-store` en las páginas dinámicas.
        //
        // Diez minutos es holgado frente a dos actualizaciones diarias, y la
        // CDN reparte por URL completa, así que `?vista=` y `?clave=` conservan
        // cada una su copia.
        source: "/historial",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
          },
        ],
      },
      {
        // Sin estas cabeceras el navegador puede quedarse con un service worker
        // antiguo y la app dejaría de actualizarse sola.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
