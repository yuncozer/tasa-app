import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad. No había ninguna: ni CSP, ni `nosniff`, ni política
 * de referente, ni control de quién puede meter esto en un iframe.
 *
 * Se reparten en dos grupos a propósito:
 *
 * - **`COMUNES`** va en todas las rutas. Son cabeceras que no pueden romper
 *   nada porque no restringen de dónde se carga contenido, solo cierran
 *   comportamientos del navegador que esta app no usa.
 * - **La CSP de contenido va solo en lo público**, que es donde está el 100 %
 *   de los visitantes y donde el inventario de orígenes es corto y estable
 *   (nosotros mismos, y el script de analítica de Vercel). `/admin` carga
 *   imágenes y video de Cloudinary, previas en `blob:` y sube archivos
 *   directo a su API: es la superficie más movida del proyecto y la que menos
 *   se puede comprobar sin entrar con la contraseña, así que recibe solo
 *   `frame-ancestors`, que es la parte que de verdad protege ahí.
 *
 * `frame-ancestors 'none'` en los dos casos: hoy nada del proyecto se embebe.
 * Si algún día existe el widget para sitios de negocios, esa ruta llevará su
 * propia cabecera —y será una decisión explícita, no un descuido heredado.
 */
const COMUNES = [
  // El navegador respeta el `Content-Type` que declaramos en vez de adivinarlo
  // por el contenido, que es como un archivo subido acaba ejecutándose.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al salir del sitio se manda el origen, nunca la ruta completa: es el mismo
  // criterio con el que la analítica propia guarda solo el host del referente.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Ninguna de estas capacidades se usa. Declararlo evita que se puedan pedir
  // desde algo incrustado.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Dos años de HTTPS obligatorio. Sin `includeSubDomains`: no hay inventario
  // de subdominios que garantice que todos sirven por HTTPS, y esta cabecera
  // no se puede desandar a mitad — el navegador la recuerda.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Frame-Options", value: "DENY" },
];

/**
 * Los orígenes que la app pública toca de verdad, y ninguno más.
 *
 * `'unsafe-inline'` en scripts es la concesión conocida: Next inyecta su
 * arranque de hidratación en línea, y quitarlo exige nonces por petición, o
 * sea un middleware que este proyecto no tiene. Lo que sí cierran las demás
 * directivas —`object-src`, `base-uri`, `form-action`, `frame-ancestors`— no
 * depende de esa concesión.
 *
 * En desarrollo se añade `'unsafe-eval'`, que es lo que necesita la recarga en
 * caliente; en producción no entra.
 */
const CSP_PUBLICA = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  "connect-src 'self' https://va.vercel-scripts.com",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Todas las rutas, incluidas las de la API y las imágenes generadas.
        source: "/:path*",
        headers: COMUNES,
      },
      {
        // Todo menos `/admin`, por el motivo explicado arriba.
        source: "/((?!admin).*)",
        headers: [{ key: "Content-Security-Policy", value: CSP_PUBLICA }],
      },
      {
        // El panel solo recibe la parte que no depende de qué carga: que nadie
        // lo pueda meter en un iframe. La cookie es `SameSite=Strict`, así que
        // un iframe ajeno no la llevaría de todos modos, pero esto lo corta
        // antes y no cuesta nada.
        source: "/admin/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      },
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
