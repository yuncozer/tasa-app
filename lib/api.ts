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
 *
 * **El detalle no sale en producción.** `error.message` aquí no es un texto
 * nuestro: es lo que dijera la excepción, y los módulos que hablan con
 * Supabase lanzan `Supabase respondió <código>: <cuerpo de PostgREST>`, con
 * lo que ese cuerpo traiga dentro. Eso viajaba al cliente por `/api/rates`,
 * `/api/convert` y las tres rutas por proveedor, todas públicas. Quien pide
 * una tasa no puede hacer nada con ese texto; quien busca por dónde entrar,
 * sí. Fuera de producción se conserva entero, que es donde de verdad sirve.
 *
 * El mensaje corto (`message`) sigue saliendo siempre: lo escribimos
 * nosotros, dice qué falló sin decir cómo está montado por dentro, y es lo
 * que necesita quien consume la API para saber si reintentar.
 *
 * Y se registra en el servidor pase lo que pase: lo que se deja de contar
 * fuera tiene que seguir estando en los logs de Vercel, o depurar una fuente
 * caída se vuelve adivinar.
 */
export function apiError(message: string, error?: unknown, status = 502): Response {
  if (error !== undefined) console.error(`[api] ${message}`, error);

  const detail =
    process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.message : undefined;

  return Response.json({ error: message, detail }, { status, headers: { "Cache-Control": SIN_CACHE } });
}
