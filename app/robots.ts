import type { MetadataRoute } from "next";
import { sitioPublico } from "@/lib/sitio";

/**
 * `robots.txt`. Tampoco había: el sitio quedaba a lo que cada buscador
 * decidiera rastrear por su cuenta.
 *
 * Lo que se bloquea y por qué:
 *
 * - **`/admin`**: no tiene nada que indexar y listarlo en un resultado de
 *   búsqueda es señalar dónde está el formulario de contraseña.
 * - **`/api/`**: son datos y no páginas. Indexar `/api/rates` pondría una
 *   fotografía de tasas caducada en los resultados, presentada como si fuera
 *   la de ahora — el mismo daño que el proyecto evita en todas partes.
 * - **Los atajos** (`/hoy`, `/laparada`, `/p/`): son redirecciones a
 *   Instagram cuyo destino cambia, así que lo que un buscador guardara hoy
 *   apuntaría mañana a otro post. Sus vistas previas se siguen viendo al
 *   compartirlas por WhatsApp, que es para lo que existen: el rastreador que
 *   arma esa tarjeta no consulta `robots.txt` para eso.
 *
 * No se bloquea `/convertir/`, que es justo lo contrario: existe para que lo
 * rastreen.
 */
export default function robots(): MetadataRoute.Robots {
  const base = sitioPublico();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/hoy", "/laparada", "/p/"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
