/**
 * El dominio público, para lo que necesita una URL absoluta desde dentro de la
 * app: la canónica de las páginas de conversión, el sitemap y `robots.txt`.
 *
 * Se diferencia de `sitioUrl()` (`lib/caption.ts`) en que **no lanza sin
 * `SITE_URL`**, y el motivo es el mismo que documenta `lib/atajos.ts` para el
 * perfil de Instagram: aquello se ejecuta al publicar, donde un despliegue mal
 * configurado tiene que fallar ruidosamente; esto se ejecuta al construir el
 * sitemap y al renderizar una página pública, donde reventar el build por una
 * variable ausente es peor que caer al dominio conocido.
 *
 * Sin barra final, para poder concatenar rutas sin duplicarla.
 */
const DOMINIO = "https://latasa.online";

export function sitioPublico(): string {
  return (process.env.SITE_URL || DOMINIO).replace(/\/$/, "");
}
