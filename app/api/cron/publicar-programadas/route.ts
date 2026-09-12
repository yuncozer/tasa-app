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
 * Cuánto puede tardar la respuesta entera. cron-job.org da por fallido todo lo
 * que pase de 30 s, así que este tope es el límite real del disparo y hay que
 * repartirlo entre leer la cola y avanzar la publicación — no darle 20 s fijos
 * a lo segundo después de haber gastado lo que haga falta en lo primero.
 */
const TOPE_RESPUESTA_MS = 25_000;

/**
 * Cuánto se le deja como mucho a la lectura, con sus reintentos. Lo que sobre
 * va al worker. Es generoso porque el caso normal es la cola vacía —ahí no hay
 * nada que avanzar y el tiempo se aprovecha entero—, y cuando sí hay fila, lo
 * que quede alcanza para una fase: la fila recuerda por dónde iba.
 */
const TOPE_LECTURA_MS = 18_000;

/**
 * Saca de la cola lo que toque, reintentando mientras quede presupuesto.
 *
 * La puerta de enlace de Supabase suelta cada tanto una petición a los cinco
 * segundos con un 504, aunque esa misma consulta resuelva normalmente en menos
 * de medio. Cuando esto se escribió eran 26 de 1.444 lecturas en 24 horas
 * (1,8 %), todas clavadas en ~5.200 ms frente a una media de 425, y con **un**
 * reintento bastaba.
 *
 * Dejó de bastar. Medido otra vez el 12 de septiembre de 2026 sobre los logs
 * del proyecto: 355 de 1.905 lecturas de esta tabla en 504, o sea un 18,6 %, y
 * con un escalón limpio —hasta las 22:00 UTC del día 11 rondaba el 5 %, desde
 * las 23:00 se instaló en el 22 % y ahí siguió dieciocho horas—. Postgres no se
 * entera: sus logs de esas horas no tienen ni un error ni una consulta lenta,
 * solo checkpoints. El 504 lo pone la puerta de enlace.
 *
 * Con dos intentos a esa tasa fallan los dos un 4,8 % de las veces, que sobre
 * 720 disparos al día son unos 35 — y eso es exactamente lo que se vio: más de
 * treinta correos de "correcto tras un fallo anterior" en un día. Con tres
 * intentos la cuenta baja al 1 %, unos siete al día; con cuatro, a dos. El
 * número de intentos no está fijado: se reintenta mientras quede tiempo del
 * presupuesto, que es lo que se adapta solo si la intermitencia empeora o se
 * calma.
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
async function reclamarConReintento(hasta: number) {
  let intento = 0;

  for (;;) {
    try {
      return (await reclamarEnProceso()) ?? (await reclamarVencida());
    } catch (error) {
      intento += 1;

      // Se registra cada fallo aunque un reintento salve el disparo: el rastro
      // en los logs de Vercel es lo que permitió medir que la intermitencia
      // había pasado del 1,8 % al 18,6 %.
      console.error(`[cron/publicar-programadas] lectura fallida (intento ${intento}), se reintenta`, error);

      // Sin tiempo para otra vuelta se propaga, y la ruta contesta 502. No se
      // contesta 200: si Supabase se cae de verdad, ese rojo en cron-job.org es
      // la única señal de que la cola dejó de mirarse.
      if (Date.now() + ESPERA_REINTENTO_MS >= hasta) throw error;

      await new Promise((resolve) => setTimeout(resolve, ESPERA_REINTENTO_MS));
    }
  }
}

export async function GET(request: NextRequest) {
  if (!esCronAutorizado(request)) {
    return apiError("No autorizado", undefined, 401);
  }

  const finDeLaRespuesta = Date.now() + TOPE_RESPUESTA_MS;

  let programada;
  try {
    programada = await reclamarConReintento(Math.min(Date.now() + TOPE_LECTURA_MS, finDeLaRespuesta));
  } catch (error) {
    return apiError("No se pudo leer la cola de publicaciones", error);
  }

  if (!programada) {
    return apiJson({ ok: true, publicada: null });
  }

  // Lo que quede del tope, no 20 s por encima de lo ya gastado leyendo.
  const resultado = await avanzarPublicacion(programada, finDeLaRespuesta - Date.now());

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
