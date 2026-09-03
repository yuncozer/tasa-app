import { sonIguales } from "@/lib/comparar";

/**
 * El guardián de los disparos automáticos: los seis crons de cron-job.org y
 * el `POST /api/publish-instagram-news`, que publica de verdad en la cuenta.
 *
 * Sustituye a siete copias de
 * `if (auth !== \`Bearer ${process.env.CRON_SECRET}\`)`, que tenían dos
 * problemas:
 *
 * - **Fallaban en abierto.** Con `CRON_SECRET` sin definir, la plantilla
 *   producía la cadena `"Bearer undefined"`, así que una petición con esa
 *   cabecera literal pasaba el control. Un despliegue con la variable mal
 *   copiada dejaba las siete rutas abiertas —incluida la que publica— y nada
 *   lo habría dicho. Ahora, sin secreto no entra nadie, y queda anotado en el
 *   log del servidor: es un fallo de configuración, no un intento de acceso,
 *   y hay que poder distinguirlos al mirar por qué no publica.
 * - **Comparaban con `!==`**, que se detiene en el primer carácter distinto.
 *
 * No lanza nunca: quien llama espera un booleano para devolver su 401, y una
 * excepción aquí convertiría una petición no autorizada en un 500.
 */
export function esCronAutorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("[cron] Falta configurar CRON_SECRET: se rechaza la petición");
    return false;
  }

  const recibido = request.headers.get("authorization");
  if (!recibido) return false;

  return sonIguales(`Bearer ${secreto}`, recibido);
}
