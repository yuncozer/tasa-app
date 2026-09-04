import type { MetadataRoute } from "next";
import { slugDe, todasLasConversiones } from "@/lib/conversiones-seo";
import { sitioPublico } from "@/lib/sitio";

/**
 * El mapa del sitio. No había ninguno: hasta ahora la app tenía dos páginas
 * indexables y ni siquiera las declaraba.
 *
 * Solo entra lo que es una página de contenido. Quedan fuera a propósito:
 *
 * - **`/admin` y sus hijas**, que exigen sesión. Aunque un buscador no pueda
 *   entrar, listarlas es publicar el mapa del panel.
 * - **Los atajos** (`/hoy`, `/wa`, `/ig`, `/laparada`, `/p/<slug>`), que no son
 *   páginas sino redirecciones con vista previa: lo que hay al otro lado es
 *   Instagram, y su contenido cambia dos veces al día.
 * - **Las rutas de la API y las de imagen**, que no tienen nada que leer.
 *
 * `lastModified` se pone al momento de servir el sitemap y no a una fecha fija:
 * estas páginas cambian cuando cambian las tasas, o sea varias veces al día, y
 * decir lo contrario sería pedirle al buscador que no vuelva.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = sitioPublico();
  const ahora = new Date();

  const paginas: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: ahora, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/historial`, lastModified: ahora, changeFrequency: "daily", priority: 0.6 },
  ];

  for (const conversion of todasLasConversiones()) {
    paginas.push({
      url: `${base}/convertir/${slugDe(conversion)}`,
      lastModified: ahora,
      changeFrequency: "hourly",
      // Por debajo de la portada: son la puerta de entrada, no el destino.
      priority: 0.8,
    });
  }

  return paginas;
}
