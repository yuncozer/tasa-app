import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { construirAlertaBrecha } from "@/lib/alerta-brecha";
import { apiError, apiJson } from "@/lib/api";
import { redactarAnalisisBrecha, redactarAnalisisSemanal, redactarCaptionNoticia } from "@/lib/ia-textos";
import { getRates } from "@/lib/rates";
import { construirReporteSemanal } from "@/lib/semanal";

/**
 * El único punto de entrada de la IA en toda la aplicación: redacta un texto y
 * lo devuelve para que el admin lo revise. **No publica nada.**
 *
 * Una sola ruta para los tres casos —caption de noticia y los análisis del
 * semanal y de la alerta de brecha— porque comparten guard, saneado y forma de
 * respuesta; el discriminante `tipo` es el mismo patrón que ya usa
 * `PublicacionPayload`.
 *
 * Protegida por la cookie de sesión como el resto de `/api/admin`: la clave de
 * OpenRouter, igual que `CRON_SECRET`, nunca llega al navegador.
 */
export const runtime = "nodejs";

/** Un modelo gratuito puede tardar; `lib/ia.ts` aborta a los 20 s y prueba el siguiente. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);

  try {
    let texto: string | null;

    if (body?.tipo === "semanal") {
      // Las cifras no llegan del navegador: se recomponen aquí, igual que en
      // `publish-semanal`, para que el análisis se escriba sobre las tasas
      // vigentes y no sobre lo que quedó en una pestaña abierta.
      const reporte = await construirReporteSemanal(await getRates());
      texto = await redactarAnalisisSemanal(reporte);
    } else if (body?.tipo === "brecha") {
      // Igual que el semanal: las cifras se recomponen aquí y no llegan del
      // navegador. `comparar` decide la variante, con el mismo default que
      // `/api/admin/publish-brecha` — el prompt cambia entre las dos, porque en
      // "solo hoy" no hay movimiento del que hablar.
      const alerta = await construirAlertaBrecha(await getRates(), { comparar: body?.comparar !== false });
      texto = await redactarAnalisisBrecha(alerta);
    } else if (body?.tipo === "noticia") {
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const sourceHost = typeof body?.sourceHost === "string" ? body.sourceHost.trim() : "";
      if (!title || !sourceHost) {
        return apiError("Faltan el título o la fuente", undefined, 400);
      }
      const description = typeof body?.description === "string" ? body.description.trim() : undefined;
      texto = await redactarCaptionNoticia({ title, sourceHost, description });
    } else {
      return apiError("Tipo de redacción desconocido", undefined, 400);
    }

    // Que el modelo no haya respondido no es un fallo de esta petición: es la
    // degradación prevista. Se contesta 200 con `texto: null` y la interfaz dice
    // que se mantiene el texto de plantilla.
    return apiJson({ texto, origen: texto === null ? "plantilla" : "ia" });
  } catch (error) {
    return apiError("No se pudo redactar el texto", error);
  }
}
