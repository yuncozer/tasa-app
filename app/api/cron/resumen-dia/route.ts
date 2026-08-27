import { apiError, apiJson } from "@/lib/api";
import { notificarResumenDia } from "@/lib/notificar";
import { construirResumenDia } from "@/lib/resumen-dia";

/**
 * Manda el resumen del día por correo, una vez, de noche.
 *
 * A las 8:00 pm de Caracas ya salió todo lo que tenía que salir —los dos
 * posts de tasas, La Parada, lo que hubiera en la cola— así que el resumen
 * puede contarlo entero. Es el único aviso del proyecto que se manda **aunque
 * no haya pasado nada**: ese es justamente su valor, que un día raro se note
 * por contraste con los normales.
 *
 * No calcula nada por su cuenta: `construirResumenDia()` junta lo que ya
 * miden el histórico, la analítica propia y la Graph API, y cada bloque falla
 * por separado. Si no se pudo leer absolutamente nada, no se manda correo —
 * un mensaje que solo dice "sin dato" cuatro veces es ruido, y el fallo que
 * lo causó ya avisa por su cuenta.
 *
 * Devuelve 200 aunque el correo no salga: no mandar un resumen no es un fallo
 * de la petición, y el sistema no depende de él para nada.
 */
export const runtime = "nodejs";

/** Lee Supabase y hasta cinco métricas de la Graph API; el tope corto no alcanza. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("No autorizado", undefined, 401);
  }

  const resumen = await construirResumenDia();
  if (resumen.vacio) {
    return apiJson({ ok: true, enviado: false, motivo: "sin_datos" }, { cachear: false });
  }

  const enviado = await notificarResumenDia(resumen);
  return apiJson({ ok: true, enviado }, { cachear: false });
}
