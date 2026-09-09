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

/**
 * Cuánto se espera antes de volver a intentar la lectura de la cola. Corto a
 * propósito: lo que se sortea es un parpadeo de la puerta de enlace, no una
 * caída, y el disparo siguiente viene en dos minutos de todas formas.
 */
const ESPERA_REINTENTO_MS = 600;

/**
 * Saca de la cola lo que toque, reintentando **una vez** si la lectura falla.
 *
 * La puerta de enlace de Supabase suelta cada tanto una petición a los cinco
 * segundos con un 504, aunque esa misma consulta resuelva normalmente en menos
 * de medio: medidas 26 de 1.444 lecturas en 24 horas, todas clavadas en ~5.200
 * ms frente a una media de 425. La cola estaba vacía en las dos, así que no
 * había nada que leer.
 *
 * Sin reintento eso llegaba hasta el final: la ruta devolvía 502, cron-job.org
 * daba el disparo por fallido y el de dos minutos después —que iba en 200—
 * disparaba un correo de "ejecución correcta tras un fallo anterior". Unas dos
 * docenas de correos al día para avisar de nada, y el ruido de un aviso que no
 * corresponde a ningún problema es peor que no avisar (misma regla que rige los
 * avisos de `lib/notificar.ts`).
 *
 * Reintentar aquí es seguro: son lecturas, y el reclamo de la fila sigue siendo
 * atómico —el `estado=eq.pendiente` viaja al `WHERE` del `UPDATE`—, así que un
 * segundo intento no puede llevarse la misma fila dos veces ni duplicar un post.
 *
 * Lo que **no** se hace es tragarse el fallo y contestar 200. Si Supabase se cae
 * de verdad, ese rojo en cron-job.org es la única señal de que la cola dejó de
 * mirarse; lo que sobraba era que un parpadeo de cinco segundos quemara un
 * disparo entero.
 */
async function reclamarConReintento() {
  try {
    return (await reclamarEnProceso()) ?? (await reclamarVencida());
  } catch (error) {
    // Se registra el primer fallo aunque el reintento salve el disparo: si la
    // intermitencia empeora, el rastro tiene que estar en los logs de Vercel.
    console.error("[cron/publicar-programadas] lectura fallida, se reintenta", error);
    await new Promise((resolve) => setTimeout(resolve, ESPERA_REINTENTO_MS));
    return (await reclamarEnProceso()) ?? (await reclamarVencida());
  }
}

export async function GET(request: NextRequest) {
  if (!esCronAutorizado(request)) {
    return apiError("No autorizado", undefined, 401);
  }

  let programada;
  try {
    programada = await reclamarConReintento();
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
