/**
 * Piezas comunes de la API REST: respuestas de error y política de caché.
 */

/**
 * Caché en la CDN, no en el navegador.
 *
 * - `max-age=0`: el teléfono del usuario no guarda copia propia, así que una
 *   corrección nuestra nunca queda pegada en su dispositivo.
 * - `s-maxage=60`: la CDN sí guarda, y sirve la misma respuesta a todo el mundo
 *   durante un minuto. Así el BCV, Binance y datos.gov.co reciben como mucho una
 *   consulta por minuto, entre dos personas o entre dos mil: sin esto, cada
 *   instancia que Vercel levanta nace con la caché en memoria vacía y repite la
 *   ronda de llamadas.
 * - `stale-while-revalidate=300`: al vencer el minuto se entrega igualmente la
 *   copia anterior al instante y se refresca por detrás, de modo que nadie espera
 *   a que respondan las fuentes.
 */
const CACHE_TASAS = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

/** Lo contrario: nada de cachés, ni la del navegador ni la de la CDN. */
const SIN_CACHE = "no-store";

/** Respuesta JSON que la CDN puede compartir entre usuarios. */
export function apiJson(data: unknown, opciones?: { cachear?: boolean }): Response {
  return Response.json(data, {
    headers: { "Cache-Control": opciones?.cachear === false ? SIN_CACHE : CACHE_TASAS },
  });
}

/**
 * Envoltorio único de errores para todas las rutas de la API.
 *
 * Nunca se cachean: si una fuente se cae, el fallo no debe quedarse pegado en la
 * CDN un minuto más de lo necesario.
 */
export function apiError(message: string, error?: unknown, status = 502): Response {
  const detail = error instanceof Error ? error.message : undefined;
  return Response.json({ error: message, detail }, { status, headers: { "Cache-Control": SIN_CACHE } });
}
