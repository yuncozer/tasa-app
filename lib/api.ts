/**
 * Piezas comunes de la API REST: respuestas de error y política de caché.
 */

/** Nada de cachés, ni la del navegador ni la de la CDN. */
const SIN_CACHE = "no-store";

/**
 * Respuesta JSON de la API. **Nunca cacheada, y ese es el valor seguro.**
 *
 * Aquí vivía una cabecera de CDN (`s-maxage=60`) que compartía la respuesta
 * entre todos los usuarios durante un minuto, y era lo correcto mientras las
 * rutas de datos eran públicas: así el BCV, Binance y datos.gov.co recibían una
 * consulta por minuto entre dos personas o entre dos mil.
 *
 * Dejó de serlo al ponerles clave (`lib/api-publica.ts`). Una CDN cachea por
 * URL, no por cabecera, así que el primer 200 servido a quien sí tiene clave se
 * habría entregado igual a quien no la tiene: la puerta se cerraba por delante
 * y quedaba abierta por detrás. Y como las únicas cuatro llamadas que usaban
 * esa rama son justo las que se cerraron, la opción entera se retiró en vez de
 * quedarse como un valor por defecto peligroso para la siguiente ruta pública
 * que alguien escriba.
 *
 * A los proveedores los sigue protegiendo `lib/cache.ts`, con sus cinco minutos
 * en memoria — que es lo que de verdad hacía el trabajo, y ahora además solo lo
 * pide quien tiene clave.
 */
export function apiJson(data: unknown): Response {
  return Response.json(data, { headers: { "Cache-Control": SIN_CACHE } });
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
