import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { esCronAutorizado } from "@/lib/cron-auth";
import { notificarProgramadaFallida } from "@/lib/notificar";
import { resumenPublicacion } from "@/lib/publish-news";
import { reclamarEnProceso, reclamarVencida } from "@/lib/programadas";
import { avanzarPublicacion } from "@/lib/worker-programadas";

/**
 * Saca de la cola las publicaciones que ya vencieron y las lleva un trozo más
 * cerca de Instagram.
 *
 * Lo dispara cron-job.org, no Vercel Cron: en el plan Hobby cada cron solo
 * puede ejecutarse **una vez al día**, así que no sirve para mirar una cola
 * (ver la sección de publicaciones programadas en `CLAUDE.md`).
 *
 * Cada disparo avanza **una sola** publicación y solo mientras le quede
 * presupuesto de tiempo (`avanzarPublicacion`), porque un carrusel con video
 * necesita esperas de Meta que no caben ni en el minuto de la función ni en
 * los 30 segundos que cron-job.org espera por una respuesta. Lo que falte lo
 * hace el disparo siguiente: la fila recuerda por dónde iba.
 *
 * Por lo mismo se atiende primero lo que quedó a medias y solo después se saca
 * algo nuevo de la cola: terminar lo empezado antes de empezar otra cosa.
 */
export const runtime = "nodejs";

/** Aun con presupuesto, un viaje lento a Meta puede estirar la ejecución. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!esCronAutorizado(request)) {
    return apiError("No autorizado", undefined, 401);
  }

  let programada;
  try {
    programada = (await reclamarEnProceso()) ?? (await reclamarVencida());
  } catch (error) {
    return apiError("No se pudo leer la cola de publicaciones", error);
  }

  if (!programada) {
    return apiJson({ ok: true, publicada: null });
  }

  const resultado = await avanzarPublicacion(programada);

  // Una `fallida` ya no se reintenta sola: se queda en la cola esperando que
  // alguien decida. Es justo el caso que hay que contar, y ocurre una vez por
  // publicación, así que el aviso no puede repetirse.
  if (resultado.estado === "fallida") {
    await notificarProgramadaFallida(
      resumenPublicacion(programada.payload),
      resultado.error ?? "Sin detalle",
    );
  }

  return apiJson({ ok: true, id: programada.id, ...resultado });
}
