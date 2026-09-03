import { leerAjustesDiaSeguro } from "@/lib/ajustes-publicacion";
import { apiError, apiJson } from "@/lib/api";
import { esCronAutorizado } from "@/lib/cron-auth";
import { revisarCordura } from "@/lib/cordura-tasas";
import { notificarEsperaLarga } from "@/lib/notificar";
import { publicarTasasDelDia } from "@/lib/publish-hoy";
import { getRates } from "@/lib/rates";
import { liberarPendiente, marcarPublicada, reclamarPendiente, tasasBaseCompletas } from "@/lib/tasas-pendientes";

/**
 * Reintenta cada 2 minutos el post de tasas que `app/api/cron/publish-instagram`
 * dejó en espera por faltarle una tasa base (dólar BCV, euro BCV, Binance
 * compra/venta). Va en cron-job.org, no en `vercel.json` — mismo motivo que
 * el resto de los crons del proyecto: el plan Hobby de Vercel no da esa
 * cadencia.
 *
 * No hay nada que avanzar por fases aquí: cada disparo toma como mucho una
 * fila, comprueba las tasas en vivo, y si ya están completas publica de un
 * tirón con la misma puerta única (`publicarTasasDelDia`) que usa el cron
 * normal y el botón manual de `/admin/hoy`. Si siguen incompletas, suelta la
 * fila sin tocar su estado para que el disparo de dentro de 2 minutos la
 * vuelva a intentar.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A los cuántos intentos se avisa por correo. Con un disparo cada 2 minutos,
 * quince son media hora: pasada esa marca, una fuente que no responde deja de
 * ser una espera normal.
 *
 * Se compara con `===` y no con `>=` a propósito: así el correo sale **una
 * vez**, en el intento quince, y no cada dos minutos a partir de ahí. Un aviso
 * repetido se convierte en ruido que se ignora, que es peor que no avisar.
 */
const INTENTOS_PARA_AVISAR = 15;
const MINUTOS_DE_ESPERA = INTENTOS_PARA_AVISAR * 2;

export async function GET(request: Request) {
  if (!esCronAutorizado(request)) {
    return apiError("No autorizado", undefined, 401);
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    return apiError("Falta configurar SITE_URL", undefined, 500);
  }

  const pendiente = await reclamarPendiente().catch(() => null);
  if (!pendiente) {
    return apiJson({ ok: true, estado: "nada_pendiente" }, { cachear: false });
  }

  if (pendiente.intentos === INTENTOS_PARA_AVISAR) {
    await notificarEsperaLarga(pendiente.momento, MINUTOS_DE_ESPERA);
  }

  // El admin pudo apagar este disparo después de que se encolara: publicarlo
  // igual sería desobedecer lo último que pidió. Se marca como publicada para
  // sacarla de la cola — no está pendiente de nada, se decidió que no salga.
  const modo = (await leerAjustesDiaSeguro(pendiente.fecha))[pendiente.momento];
  if (modo === "apagado") {
    await marcarPublicada(pendiente.id).catch(() => {});
    return apiJson({ ok: true, estado: "apagado" }, { cachear: false });
  }

  try {
    const snapshot = await getRates();
    if (!tasasBaseCompletas(snapshot)) {
      await liberarPendiente(pendiente.id);
      return apiJson({ ok: true, estado: "sigue_incompleta" }, { cachear: false });
    }

    // La misma guardia que aplicó el cron normal: si publicara aquí, el dato
    // imposible saldría dos minutos más tarde y la puerta no habría servido
    // de nada. Sin avisar: el correo ya salió en el disparo que la detectó.
    if (await revisarCordura(snapshot)) {
      await liberarPendiente(pendiente.id);
      return apiJson({ ok: true, estado: "salto_anomalo" }, { cachear: false });
    }

    const { mediaId, enlace } = await publicarTasasDelDia(siteUrl, pendiente.momento, modo);
    await marcarPublicada(pendiente.id);
    return apiJson({ ok: true, estado: "publicada", mediaId, enlace }, { cachear: false });
  } catch (error) {
    // Error transitorio (Meta, Supabase, la propia red): se suelta la fila
    // para reintentar en 2 minutos, en vez de darla por perdida. El estado
    // sigue en `pendiente`, así que el próximo disparo la recoge solo.
    await liberarPendiente(pendiente.id).catch(() => {});
    return apiError("No se pudo publicar el post de tasas pendiente", error);
  }
}
