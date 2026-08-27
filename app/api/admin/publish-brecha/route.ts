import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { construirAlertaBrecha } from "@/lib/alerta-brecha";
import { apiError, apiJson } from "@/lib/api";
import { buildCaptionBrecha } from "@/lib/caption";
import { publishStory } from "@/lib/instagram";
import { ejecutarPublicacion, urlAlertaBrecha } from "@/lib/publish-news";
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
 * `destino` elige entre el feed y la Historia. La Historia sí se publica desde
 * aquí, al contrario que la del reporte semanal: aquella necesita un sticker de
 * enlace —lo único que la hace útil— y la Graph API no lo admite, mientras que
 * esta no lleva ningún llamado a la acción, igual que las Historias del post
 * diario (`publicarTasasDelDia`). El botón de descargar el 9:16 se queda de
 * todas formas, para cuando sí se quiera subir a mano con sticker.
 *
 * La Historia no lleva caption: Meta lo ignora en `media_type=STORIES`. Por eso
 * el caption solo se compone en el camino del feed.
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

  const body = await request.json().catch(() => null);
  // Cualquier cosa que no sea "historia" es el feed: el destino por defecto es
  // el post, que es lo que hace el botón principal.
  const destino = body?.destino === "historia" ? "historia" : "feed";
  // Igual que el destino: por defecto la pieza compara, que es la variante
  // principal. `comparar: false` es la elección explícita de publicar solo el
  // nivel de hoy.
  const comparar = body?.comparar !== false;

  try {
    const snapshot = await getRates();
    const alerta = await construirAlertaBrecha(snapshot, { comparar });

    if (!alerta.publicable) {
      return apiError("Falta una de las dos tasas: sin brecha no hay alerta que publicar", undefined, 409);
    }

    const { mediaId } =
      destino === "historia"
        ? await publishStory(urlAlertaBrecha("9:16", comparar))
        : await ejecutarPublicacion({ tipo: "brecha", caption: buildCaptionBrecha(alerta), comparar });

    return apiJson({ ok: true, mediaId, destino }, { cachear: false });
  } catch (error) {
    return apiError(
      destino === "historia" ? "No se pudo publicar la Historia" : "No se pudo publicar la alerta de brecha",
      error,
    );
  }
}
