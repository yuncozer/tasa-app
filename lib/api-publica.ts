import { sonIguales } from "@/lib/comparar";

/**
 * El guardián de la API de datos: `/api/rates`, sus tres rutas por proveedor y
 * `/api/convert`.
 *
 * Estuvieron abiertas y sin clave desde el principio, cacheadas en la CDN.
 * Cualquiera podía montar una app encima de estas tasas sin que aquí se
 * supiera, y **el histórico de esta cuenta es el activo que no se puede
 * comprar en otro sitio** (ver la sección de monetización en CLAUDE.md): la
 * serie con mañana y tarde separadas desde agosto no la tiene nadie más.
 *
 * Lo que **no** se cierra, y conviene tener claro por qué:
 *
 * - **`/api/health`**: dice si un proveedor responde y con qué degradación,
 *   nunca una tasa. Es un diagnóstico, y cerrarlo rompería cualquier monitor
 *   de disponibilidad apuntado ahí sin proteger ningún dato.
 * - **`/api/eventos`**: la llama el navegador de cada visitante, así que no
 *   puede llevar clave. Su defensa es otra —conjunto cerrado y techo por IP—.
 * - **Las rutas `/api/og/*`**: Meta tiene que poder descargarlas al publicar.
 *
 * Las claves viven en `API_KEYS`, separadas por comas, y no en una tabla: hoy
 * no hay ni un cliente, y una tabla con su pantalla de administración es
 * construir la facturación antes que el primer cobro. Cuando haya alguien
 * pagando, dar de alta una clave es añadirla a la variable; si algún día son
 * varios y hace falta saber quién consume cuánto, entonces sí toca la tabla.
 */

/**
 * Sin `API_KEYS` configurado **no entra nadie**, igual que `esCronAutorizado()`
 * con su secreto: un despliegue con la variable mal copiada tiene que dejar la
 * puerta cerrada, no abierta de par en par — que es exactamente el fallo que se
 * arregló en los crons.
 */
function clavesValidas(): string[] {
  return (process.env.API_KEYS ?? "")
    .split(",")
    .map((clave) => clave.trim())
    .filter(Boolean);
}

/**
 * `null` si la petición trae una clave buena; si no, la respuesta de rechazo ya
 * armada para devolverla tal cual.
 *
 * El 401 **dice cómo conseguir una clave** en vez de cerrar la puerta en
 * silencio: quien llega hasta aquí quería estos datos, o sea que es justo la
 * persona a la que se le podría vender el acceso. Un rechazo mudo convierte un
 * cliente potencial en alguien que se va a buscar otra fuente.
 *
 * Se anota en el log del servidor para poder responder algo que hasta ahora no
 * se podía: **si alguien estaba usando esto**. Sin ese registro, cerrar la API
 * sería enterarse por un correo enfadado o no enterarse nunca.
 */
export function claveApiValida(request: Request): Response | null {
  const claves = clavesValidas();
  const recibida = request.headers.get("x-api-key");

  if (recibida && claves.some((clave) => sonIguales(clave, recibida))) return null;

  console.warn(
    `[api] Petición sin clave válida a ${new URL(request.url).pathname}` +
      ` · origen: ${request.headers.get("origin") ?? "—"}` +
      ` · agente: ${(request.headers.get("user-agent") ?? "—").slice(0, 80)}`,
  );

  return Response.json(
    {
      error: "Esta API necesita una clave",
      comoObtenerla: "https://www.instagram.com/latasa.online",
    },
    {
      status: 401,
      // Un rechazo cacheado seguiría rechazando a quien ya tiene clave, y —peor—
      // un 200 cacheado se serviría a quien no la tiene. Ver `apiJson`.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
