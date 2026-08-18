import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { buildCaptionSemanal } from "@/lib/caption";
import { sanearTextoIa } from "@/lib/ia";
import { MAX_ANALISIS } from "@/lib/ia-textos";
import { ejecutarPublicacion } from "@/lib/publish-news";
import { getRates } from "@/lib/rates";
import { construirReporteSemanal } from "@/lib/semanal";

/**
 * Publica el reporte semanal en el feed, desde `/admin/semanal`. Protegida por
 * la cookie de sesión, como el resto de `/api/admin`.
 *
 * El caption se compone aquí y no llega del navegador: así lo que se publica
 * sale de las mismas filas que pintan la imagen, y no de un texto que pudo
 * quedar viejo en una pestaña abierta.
 *
 * Lo único que sí viaja desde el navegador es `analisis`: el párrafo de
 * contexto que el admin escribió o pidió a la IA en `/admin/semanal`. Las
 * cifras se siguen componiendo aquí —esa es la razón de ser de este route— y la
 * prosa se vuelve a sanear en el servidor con `sanearTextoIa()`: que el cliente
 * ya lo hiciera no es algo en lo que se pueda confiar.
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
  const analisis = typeof body?.analisis === "string" ? sanearTextoIa(body.analisis, MAX_ANALISIS) : null;

  try {
    const snapshot = await getRates();
    const reporte = await construirReporteSemanal(snapshot);
    const caption = buildCaptionSemanal(reporte, analisis ?? undefined);

    const { mediaId } = await ejecutarPublicacion({ tipo: "semanal", caption });
    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el reporte semanal", error);
  }
}
