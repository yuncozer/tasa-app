import { guardarEvento, normalizarEvento } from "@/lib/analiticas-web";
import { claveDeIp, registrar } from "@/lib/limite-intentos";

/**
 * Recibe los eventos de `lib/analitica-cliente.ts`.
 *
 * Es la única ruta pública que escribe en Supabase, y tiene dos defensas
 * distintas que conviene no confundir:
 *
 * - **Qué se guarda**: todo pasa por `normalizarEvento()`, así que el tipo
 *   está en un conjunto cerrado y cada texto se recorta. No hay
 *   autenticación posible —la llama el navegador de cualquier visitante— así
 *   que la defensa es que lo guardado no pueda ser texto arbitrario.
 * - **Cuánto se guarda**: eso no lo cubría nada. Un script en bucle llenaba
 *   la tabla sin techo, lo que quema el plan de Supabase y —más caro—
 *   corrompe las únicas cifras con las que se puede sostener una
 *   conversación comercial: unas métricas que se pueden inflar desde fuera
 *   no valen nada. De ahí el tope por IP y el descarte de lo que no viene de
 *   nuestro propio origen.
 *
 * Ninguna de las dos comprobaciones nuevas es autenticación, y no pretenden
 * serlo: la cabecera `Origin` la escribe quien llama y la IP se puede
 * repartir. Cortan el bucle barato, que es de lo que se trata.
 *
 * **Siempre contesta 204, incluso ante un cuerpo inválido, un exceso de
 * peticiones o un Supabase caído.** Quien llama es un `sendBeacon` que no
 * mira la respuesta, y un error aquí no le da al navegador nada que hacer;
 * devolver un 4xx solo convertiría esto en un oráculo de qué acepta la ruta
 * —y, con el límite, de cuándo se activa—. Lo que sí importa es que nunca se
 * cachee: `apiJson` no sirve porque su cabecera por defecto es la de la CDN.
 */

const SIN_CONTENIDO = { status: 204, headers: { "Cache-Control": "no-store" } } as const;

/**
 * Holgado para una persona, estrecho para un bucle.
 *
 * Una sesión activa manda del orden de una decena de eventos por minuto
 * —visita, conversiones mientras se teclea, alguna copia—, y por una misma
 * IP pueden salir varias a la vez: un local con wifi compartido, o una red
 * móvil que agrupa clientes tras la misma salida. Ciento veinte por minuto
 * deja sitio de sobra para eso y aun así corta en seco cualquier bucle.
 */
const MAX_POR_MINUTO = 120;
const VENTANA_MS = 60 * 1000;

/**
 * De dónde puede venir un evento legítimo.
 *
 * El beacon viaja como `text/plain` justamente para no disparar la
 * comprobación previa de CORS, así que el navegador lo deja salir desde
 * cualquier página — pero sí declara de dónde salió. `Sec-Fetch-Site` lo dice
 * mejor que `Origin` (que en una petición del mismo sitio a veces ni viaja),
 * y cuando ninguna de las dos está se deja pasar: hay navegadores viejos que
 * no mandan ninguna, y perder sus eventos sería peor que el abuso que se
 * evita.
 */
function vieneDeLaApp(request: Request): boolean {
  const sitio = request.headers.get("sec-fetch-site");
  if (sitio && sitio !== "same-origin" && sitio !== "same-site" && sitio !== "none") return false;

  const origen = request.headers.get("origin");
  if (!origen) return true;

  try {
    return new URL(origen).hostname === new URL(request.url).hostname;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!vieneDeLaApp(request)) return new Response(null, SIN_CONTENIDO);
    if (!registrar(claveDeIp(request, "eventos"), MAX_POR_MINUTO, VENTANA_MS).permitido) {
      return new Response(null, SIN_CONTENIDO);
    }

    // El beacon viaja como `text/plain` para no disparar la comprobación
    // previa de CORS, así que el JSON se parsea a mano.
    const evento = normalizarEvento(JSON.parse(await request.text()));
    if (evento) await guardarEvento(evento);
  } catch {
    // Ni el cuerpo mal formado ni el fallo de Supabase se reportan: perder un
    // evento de analítica no es un incidente, y el visitante no puede hacer
    // nada al respecto.
  }

  return new Response(null, SIN_CONTENIDO);
}
