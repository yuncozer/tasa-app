import { claveDeIp, registrar } from "@/lib/limite-intentos";

/**
 * Techo por IP para las seis rutas que generan imágenes.
 *
 * Son públicas por necesidad —Meta tiene que poder descargarlas al publicar—
 * y cada petición es cara: alrededor de 0,8 s de Satori componiendo un PNG de
 * 150 KB, más una lectura a Supabase. No llevan caché y no pueden llevarla,
 * que es la parte que conviene no olvidar: el cron congela `snapshot_hoy` y
 * un instante después Meta pide esta misma URL. Si la CDN guardara una copia,
 * a Meta le llegaría la imagen del ciclo anterior y el post saldría con la
 * imagen diciendo una cifra y el caption otra — exactamente el fallo que
 * `lib/snapshot-hoy.ts` existe para evitar. Así que lo que se acota es
 * cuántas veces se puede pedir, no cuánto dura la copia.
 *
 * El tope es holgado a propósito. Quien las pide de verdad son Meta al
 * publicar (una vez), el rastreador de WhatsApp cuando alguien pega `/hoy` en
 * un chat, y el navegador de quien abre ese enlace. Treinta por minuto no
 * estorba a ninguno de los tres y corta en seco el bucle que las usaría para
 * quemar minutos de función.
 */
const MAX_POR_MINUTO = 30;
const VENTANA_MS = 60 * 1000;

/**
 * Devuelve la respuesta de rechazo si hay que rechazar, o `null` para seguir.
 *
 * Un 429 con `Retry-After` y no un 204 silencioso como en `/api/eventos`: allí
 * quien llama es un `sendBeacon` que no mira la respuesta, y aquí es un
 * rastreador que sí sabe leerla y volver más tarde. Nunca se cachea, o el
 * rechazo se quedaría pegado en la CDN sirviéndose a quien no tuvo la culpa.
 */
export function techoDeImagenes(request: Request): Response | null {
  if (registrar(claveDeIp(request, "og"), MAX_POR_MINUTO, VENTANA_MS).permitido) return null;

  return new Response("Demasiadas peticiones", {
    status: 429,
    headers: { "Retry-After": "60", "Cache-Control": "no-store" },
  });
}
