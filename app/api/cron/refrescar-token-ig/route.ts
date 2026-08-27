import { apiError, apiJson } from "@/lib/api";
import { DIAS_PARA_AVISAR, estadoToken, refrescarToken } from "@/lib/instagram-token";

/**
 * Renueva el token de Instagram antes de que caduque.
 *
 * Es el cron más aburrido del proyecto y el que evita el fallo más caro: un
 * token vencido no rompe nada de forma visible, solo deja de publicar. Como
 * Meta no expone la caducidad de un token de este flujo, `refrescarToken()`
 * la deduce del refresco y la guarda (ver `lib/instagram-token.ts`).
 *
 * **Diario, no cada pocos minutos.** El token vale 60 días y Meta exige que
 * tenga al menos 24 horas para poder refrescarlo; el propio
 * `refrescarToken()` además no llama a Meta si todavía quedan más de veinte
 * días. Un disparo al día deja veinte oportunidades antes de que la fecha
 * apriete de verdad.
 *
 * Va en cron-job.org como el resto (`vercel.json` no tiene `crons`, ver
 * CLAUDE.md), y protegido con `CRON_SECRET` igual que los demás.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("No autorizado", undefined, 401);
  }

  try {
    // La primera vez no hay fila y por tanto no hay fecha con la que decidir:
    // se fuerza para inicializar la tabla. A partir de ahí manda el umbral.
    const sinRegistrar = (await estadoToken()).diasRestantes === null;
    const resultado = await refrescarToken(sinRegistrar);

    return apiJson(
      {
        ok: true,
        ...resultado,
        avisar: resultado.diasRestantes !== null && resultado.diasRestantes <= DIAS_PARA_AVISAR,
      },
      { cachear: false },
    );
  } catch (error) {
    // Aquí sí es un error de verdad: si el refresco falla varias veces
    // seguidas, el token acabará caducando y con él las publicaciones. Que
    // salga como 502 es lo que hace que cron-job.org lo marque en rojo.
    return apiError("No se pudo refrescar el token de Instagram", error);
  }
}
