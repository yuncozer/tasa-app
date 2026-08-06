import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { buildCaption } from "@/lib/caption";
import { publishCarouselPost } from "@/lib/instagram";
import { getRates } from "@/lib/rates";

/**
 * Dispara Vercel Cron (ver `vercel.json`) dos veces al día, hora de Caracas:
 * 9:00 am y 6:00 pm. Cada entrada de `vercel.json` llama a esta misma ruta
 * con `?momento=manana` o `?momento=tarde`, que es lo que decide el título
 * del caption — explícito en vez de inferirlo de la hora del reloj, así no
 * se rompe si algún día se cambian los horarios.
 *
 * Cada disparo publica **un carrusel de dos diapositivas**: las tasas en
 * bolívares y las mismas tasas en pesos. Son un solo post y no dos porque
 * cuatro publicaciones casi idénticas al día saturan el feed y el perfil, y
 * porque el post en pesos es el complemento del de bolívares, no una noticia
 * aparte. De paso desaparece el estado a medias: un carrusel sale entero o no
 * sale, mientras que dos publicaciones seguidas pueden dejar la primera
 * publicada y la segunda no.
 *
 * A diferencia del resto de las rutas de la API, esta sí exige autenticación:
 * publica en una cuenta real y no debe poder dispararla cualquiera que
 * adivine la ruta.
 */
export const runtime = "nodejs";

/**
 * Publicar un carrusel son cuatro viajes a Meta —dos contenedores hijos, el
 * padre y la publicación—, y crear cada hijo obliga a Meta a descargarse una
 * imagen que se renderiza al vuelo. Con el tope por defecto de la plataforma
 * eso va justo, y encima `publicarContenedor()` puede esperar hasta 8 s
 * reintentando si Meta todavía está procesando.
 */
export const maxDuration = 60;

function momentoDesdeQuery(request: NextRequest): "manana" | "tarde" | undefined {
  const valor = request.nextUrl.searchParams.get("momento");
  return valor === "manana" || valor === "tarde" ? valor : undefined;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("No autorizado", undefined, 401);
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    return apiError("Falta configurar SITE_URL", undefined, 500);
  }

  try {
    const snapshot = await getRates();
    const caption = buildCaption(snapshot, momentoDesdeQuery(request));

    // El orden es el orden en que se deslizan: bolívares primero.
    const { mediaId } = await publishCarouselPost(
      [`${siteUrl}/api/og/instagram-post`, `${siteUrl}/api/og/instagram-post-pesos`],
      caption,
    );

    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de Instagram", error);
  }
}
