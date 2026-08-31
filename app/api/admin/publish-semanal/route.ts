import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { buildCaptionSemanal } from "@/lib/caption";
import { sanearTextoIa } from "@/lib/ia";
import { MAX_ANALISIS } from "@/lib/ia-textos";
import { publishStory } from "@/lib/instagram";
import { ejecutarPublicacion, urlReporteSemanal } from "@/lib/publish-news";
import { getRates } from "@/lib/rates";
import { construirReporteSemanal } from "@/lib/semanal";

/**
 * Publica el reporte semanal desde `/admin/semanal`. Protegida por la cookie de
 * sesión, como el resto de `/api/admin`.
 *
 * `destino` elige entre el feed y la Historia, igual que en `/admin/brecha`. La
 * Historia se publica desde aquí: la limitación que la mantenía en "descárgala
 * y súbela" es el sticker de enlace, que la Graph API no admite —y eso importa
 * solo cuando la pieza lleva un llamado a la acción—. El botón de descargar el
 * 9:16 se queda para cuando sí se le quiera poner uno.
 *
 * La Historia no lleva caption: Meta lo ignora en `media_type=STORIES`. Por eso
 * el caption solo se compone en el camino del feed, y por eso la Historia no
 * necesita leer el histórico —su imagen la resuelve la ruta OG por su cuenta—.
 *
 * El caption se compone aquí y no llega del navegador, salvo que el admin lo
 * haya editado: entonces manda `captionOverride` y se publica tal cual, mismo
 * criterio que `/admin/noticia`. Lo que arma la plantilla es un punto de
 * partida, no algo intocable, y quien lo reescribe se hace cargo de las cifras
 * que teclea. Mientras no lo toque sigue mandando el servidor, que es lo que
 * impide publicar un número viejo de una pestaña que lleva horas abierta.
 *
 * `analisis` es el párrafo de contexto que el admin escribió o pidió a la IA.
 * Se vuelve a sanear aquí con `sanearTextoIa()`: que el cliente ya lo hiciera
 * no es algo en lo que se pueda confiar. No se aplica al `captionOverride`,
 * que ya lo trae dentro —volver a insertarlo lo duplicaría—.
 *
 * No anota `/hoy`. "El post del día" es el de tasas, y el semanal no lo pisa —
 * misma regla que ya cumplen los posts de noticias.
 */
export const runtime = "nodejs";

/** Igual que las demás rutas que publican: crear el contenedor obliga a Meta a descargar una imagen que se renderiza al vuelo. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  // Cualquier cosa que no sea "historia" es el feed: el destino por defecto es
  // el post, que es lo que hace el botón principal.
  const destino = body?.destino === "historia" ? "historia" : "feed";
  const analisis = typeof body?.analisis === "string" ? sanearTextoIa(body.analisis, MAX_ANALISIS) : null;
  const captionOverride = typeof body?.captionOverride === "string" ? body.captionOverride.trim() : "";

  try {
    if (destino === "historia") {
      const { mediaId } = await publishStory(urlReporteSemanal("9:16"));
      return apiJson({ ok: true, mediaId, destino }, { cachear: false });
    }

    // Solo el feed necesita el reporte, y solo si el caption no viene escrito:
    // la imagen la resuelve la ruta OG por su cuenta con las tasas del momento.
    const caption =
      captionOverride ||
      buildCaptionSemanal(await construirReporteSemanal(await getRates()), analisis ?? undefined);

    const { mediaId } = await ejecutarPublicacion({ tipo: "semanal", caption });
    return apiJson({ ok: true, mediaId, destino }, { cachear: false });
  } catch (error) {
    return apiError(
      destino === "historia" ? "No se pudo publicar la Historia" : "No se pudo publicar el reporte semanal",
      error,
    );
  }
}
