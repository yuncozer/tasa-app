import { guardarEvento, normalizarEvento } from "@/lib/analiticas-web";

/**
 * Recibe los eventos de `lib/analitica-cliente.ts`.
 *
 * Es la única ruta pública que escribe en Supabase, y por eso todo lo que
 * entra pasa por `normalizarEvento()`: el tipo tiene que estar en un conjunto
 * cerrado y cada texto se recorta. No hay autenticación posible —la llama el
 * navegador de cualquier visitante— así que la defensa es que lo guardado no
 * pueda ser texto arbitrario.
 *
 * **Siempre contesta 204, incluso ante un cuerpo inválido o un Supabase
 * caído.** Quien llama es un `sendBeacon` que no mira la respuesta, y un
 * error aquí no le da al navegador nada que hacer; devolver un 4xx solo
 * convertiría esto en un oráculo de qué acepta la ruta. Lo que sí importa es
 * que nunca se cachee: `apiJson` no sirve porque su cabecera por defecto es
 * la de la CDN.
 */

const SIN_CONTENIDO = { status: 204, headers: { "Cache-Control": "no-store" } } as const;

export async function POST(request: Request): Promise<Response> {
  try {
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
