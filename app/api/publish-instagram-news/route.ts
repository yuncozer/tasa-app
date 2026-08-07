import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { publishNewsPost } from "@/lib/publish-news";
import { esUrlValida } from "@/lib/validar-url";

/**
 * Dispara a mano un post ocasional a partir de un artículo de noticias
 * externo. A diferencia de `app/api/cron/publish-instagram`, no vive bajo
 * `app/api/cron/` porque no hay ningún cron que la llame — se publica
 * cuando alguien decide compartir una noticia puntual, pasándole su URL.
 *
 * Es `POST` (no `GET` como el cron) a propósito: publicar tiene un efecto
 * secundario real y no debería poder dispararse sin querer (prefetch del
 * navegador, un link pegado en un chat, etc.).
 */
export const runtime = "nodejs";

/**
 * Igual que los routes de cron: la publicación puede llevar video, y
 * esperar a que Meta lo procese consume más que el tope por defecto.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("No autorizado", undefined, 401);
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!esUrlValida(url)) {
    return apiError("Falta un parámetro url válido (http o https)", undefined, 400);
  }

  try {
    const { mediaId } = await publishNewsPost(url);
    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de la noticia", error);
  }
}
