import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { leerProgramada, reclamarEnProceso, reclamarPorId } from "@/lib/programadas";
import { avanzarPublicacion } from "@/lib/worker-programadas";

/**
 * El botón "Publicar ahora" de la cola: adelanta una programada, o reintenta
 * una que falló, sin esperar al cron.
 *
 * Da un paso y contesta en qué quedó; el navegador vuelve a llamar hasta que
 * la publicación termina. No espera a que termine todo dentro de una petición
 * porque un carrusel con video no cabe en el tope de una función — ese era
 * justamente el fallo que dejaba filas colgadas en `publicando`.
 *
 * Comparte `avanzarPublicacion()` con el cron a propósito: si divergieran, lo
 * que sale a la hora programada dejaría de ser lo que se probó a mano.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return apiError("Falta el id", undefined, 400);

  let programada;
  try {
    // La primera llamada la arranca de cero; las siguientes la retoman, y por
    // eso pasan por el mismo reclamo que usa el cron. Si nadie la puede tomar
    // es que otra ejecución la tiene entre manos ahora mismo.
    programada = (await reclamarPorId(id)) ?? (await reclamarEnProceso(id));
    if (!programada) {
      const actual = await leerProgramada(id);
      if (actual?.estado === "publicada") return apiJson({ estado: "publicada" });
      if (actual?.estado === "publicando") {
        return apiJson({ estado: "en_proceso", fase: actual.fase });
      }
      return apiError("Esa publicación ya no se puede publicar desde aquí", undefined, 409);
    }
  } catch (error) {
    return apiError("No se pudo tomar la publicación", error);
  }

  const resultado = await avanzarPublicacion(programada);
  return apiJson(resultado);
}
