import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { leerParadaPendiente, marcarParadaPublicada } from "@/lib/parada";
import { ejecutarPublicacion } from "@/lib/publish-news";

/**
 * Publica el borrador de "Dólar en La Parada" que detectó
 * `app/api/cron/vigilar-parada/route.ts`, desde el botón de `/admin/parada`.
 * Protegida por la cookie de sesión, como el resto de `/api/admin`.
 *
 * Reutiliza `ejecutarPublicacion({ tipo: "articulo", ... })`, la misma puerta
 * que usa `/admin/noticia` para cualquier artículo externo: vuelve a
 * scrapear la URL al publicar (igual que cualquier post de noticia — así lo
 * publicado es lo que el portal tiene en ese instante, no una copia vieja) y
 * solo el caption viaja pre-armado desde el borrador.
 */
export const runtime = "nodejs";

/** Igual que las demás rutas que publican: crear el contenedor obliga a Meta a descargarse la imagen. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const pendiente = await leerParadaPendiente().catch(() => null);
  if (!pendiente || pendiente.publicado) {
    return apiError("No hay ningún borrador de La Parada pendiente de publicar", undefined, 404);
  }

  const body = await request.json().catch(() => null);
  const caption = typeof body?.caption === "string" && body.caption.trim() ? body.caption : pendiente.caption;

  try {
    const { mediaId } = await ejecutarPublicacion({
      tipo: "articulo",
      url: pendiente.url,
      caption,
      variante: "parada",
    });

    // El post ya está en la cuenta y eso es lo irreversible: un fallo al
    // marcarlo publicado no puede convertir un éxito en un error que invite
    // a reintentar y duplique el post.
    try {
      await marcarParadaPublicada();
    } catch {
      // /admin/parada seguiría ofreciendo este borrador; publicarlo de nuevo
      // solo duplicaría el post, así que toca marcarlo a mano si esto falla.
    }

    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de La Parada", error);
  }
}
