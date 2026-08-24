import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { guardarEnlace } from "@/lib/enlaces";
import { permalinkDeMedia, publishDailyPost } from "@/lib/instagram";
import { guardarCamposParada, leerParadaPendiente, marcarParadaPublicada, LUGAR_PARADA_DEFECTO } from "@/lib/parada";

/**
 * Publica el borrador de "Dólar en La Parada" que detectó
 * `app/api/cron/vigilar-parada/route.ts`, desde el botón de `/admin/parada`.
 * Protegida por la cookie de sesión, como el resto de `/api/admin`.
 *
 * A diferencia de un post de noticia cualquiera, no pasa por
 * `ejecutarPublicacion({ tipo: "articulo", ... })`: esa puerta vuelve a
 * scrapear la URL al publicar, que tiene sentido cuando el título o la foto
 * pueden haber cambiado en el portal — pero acá compra/venta ya las
 * confirmó el admin a mano, así que no hay nada que rescrapear. La imagen
 * la sirve `/api/og/instagram-post-parada`, que lee el borrador directo de
 * Supabase (sin firma: no recibe texto libre por query string), así que
 * primero hay que guardar los campos editados y solo entonces pedirle esa
 * URL a Meta.
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
  const lugar = typeof body?.lugar === "string" && body.lugar.trim() ? body.lugar.trim() : LUGAR_PARADA_DEFECTO;
  const compra = typeof body?.compra === "string" && body.compra.trim() ? body.compra.trim() : null;
  const venta = typeof body?.venta === "string" && body.venta.trim() ? body.venta.trim() : null;
  const caption = typeof body?.caption === "string" && body.caption.trim() ? body.caption : pendiente.caption;

  if (!compra || !venta) {
    return apiError("Confirmá compra y venta antes de publicar", undefined, 400);
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    return apiError("Falta configurar SITE_URL", undefined, 500);
  }

  try {
    // Se guarda antes de pedirle la imagen a Meta: esa ruta lee estos mismos
    // campos de Supabase, sin recibir nada por query string.
    await guardarCamposParada({ lugar, compra, venta, caption });

    const imageUrl = `${siteUrl.replace(/\/$/, "")}/api/og/instagram-post-parada`;
    const { mediaId } = await publishDailyPost(imageUrl, caption);

    // El post ya está en la cuenta y eso es lo irreversible: un fallo al
    // marcarlo publicado o anotar `/laparada` no puede convertir un éxito en
    // un error que invite a reintentar y duplique el post.
    try {
      await marcarParadaPublicada();
    } catch {
      // /admin/parada seguiría ofreciendo este borrador; toca marcarlo a mano si esto falla.
    }
    try {
      const permalink = await permalinkDeMedia(mediaId);
      await guardarEnlace("laparada", permalink);
    } catch {
      // /laparada cae a su respaldo (el perfil) si esto falla.
    }

    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de La Parada", error);
  }
}
