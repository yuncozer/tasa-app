import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { construirAlertaBrecha } from "@/lib/alerta-brecha";
import { apiError, apiJson } from "@/lib/api";
import { buildCaptionBrecha } from "@/lib/caption";
import { ejecutarPublicacion } from "@/lib/publish-news";
import { getRates } from "@/lib/rates";

/**
 * Publica la alerta de brecha en el feed, desde `/admin/brecha`. Protegida por
 * la cookie de sesión, como el resto de `/api/admin`.
 *
 * El caption se compone aquí y no llega del navegador, igual que el semanal:
 * así lo que se publica sale de la misma `AlertaBrecha` que pinta la imagen, y
 * no de un texto que pudo quedar viejo en una pestaña abierta desde la mañana.
 *
 * Sin brecha no se publica nada: la pieza entera es esa cifra, y un "—" enorme
 * no es una alerta. Es la misma regla que ya impide generar el video de tasas
 * con un hueco, y no la degradación a `Sin dato` de la portada —aquella muestra
 * un estado, esto sale a la cuenta real y no se corrige después—.
 *
 * No anota `/hoy`: "el post del día" es el de tasas, y esto no lo pisa.
 */
export const runtime = "nodejs";

/** Igual que las demás rutas que publican: crear el contenedor obliga a Meta a descargar una imagen que se renderiza al vuelo. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  try {
    const snapshot = await getRates();
    const alerta = await construirAlertaBrecha(snapshot);

    if (!alerta.publicable) {
      return apiError("Falta una de las dos tasas: sin brecha no hay alerta que publicar", undefined, 409);
    }

    const { mediaId } = await ejecutarPublicacion({ tipo: "brecha", caption: buildCaptionBrecha(alerta) });
    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar la alerta de brecha", error);
  }
}
