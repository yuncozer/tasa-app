import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { cerrarProgramada, reclamarVencida } from "@/lib/programadas";
import { ejecutarPublicacion, leerPublicacionPayload } from "@/lib/publish-news";

/**
 * Saca de la cola las publicaciones que ya vencieron y las manda a Instagram.
 *
 * Lo dispara cron-job.org cada diez minutos, no Vercel Cron: en el plan Hobby
 * cada cron solo puede ejecutarse **una vez al día**, así que no sirve para
 * mirar una cola (ver la sección de publicaciones programadas en `CLAUDE.md`).
 * De ahí que el margen sea de diez minutos y no al minuto exacto.
 *
 * Publica **una sola** por ejecución: cada publicación son varios viajes a
 * Meta y no caben más dentro del tope de tiempo. Con un disparo cada diez
 * minutos, una cola de varios posts se vacía sola.
 */
export const runtime = "nodejs";

/** Mismo motivo que el cron diario: son varios viajes a Meta más reintentos. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("No autorizado", undefined, 401);
  }

  let programada;
  try {
    programada = await reclamarVencida();
  } catch (error) {
    return apiError("No se pudo leer la cola de publicaciones", error);
  }

  if (!programada) {
    return apiJson({ ok: true, publicada: null }, { cachear: false });
  }

  // Se valida aunque venga de nuestra propia tabla: pudo guardarse con una
  // versión anterior del código.
  const payload = leerPublicacionPayload(programada.payload);
  if (!payload) {
    await cerrarProgramada(programada.id, { error: "El contenido guardado ya no es válido" });
    return apiError("El contenido guardado ya no es válido", undefined, 422);
  }

  try {
    const { mediaId } = await ejecutarPublicacion(payload);
    await cerrarProgramada(programada.id, { mediaId });
    return apiJson({ ok: true, publicada: programada.id, mediaId }, { cachear: false });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    await cerrarProgramada(programada.id, { error: detalle });
    return apiError("No se pudo publicar la programada", error);
  }
}
