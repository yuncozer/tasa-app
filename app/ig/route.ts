import { registrarAtajo } from "@/lib/analiticas-web";
import { perfilInstagram } from "@/lib/atajos";

/**
 * `/ig`: el atajo al perfil de Instagram.
 *
 * Era un `redirects()` de `next.config.ts`, que es lo idiomático para un
 * destino fijo, y se movió aquí por una sola razón: aquello se resuelve en la
 * CDN sin ejecutar código nuestro, así que no había forma de saber cuántas
 * personas usan el enlace. Ahora se anota el clic y se redirige igual, con el
 * mismo 307 de antes — un permanente se quedaría cacheado en el navegador
 * para siempre y dejaría sin arreglo un destino equivocado.
 *
 * `registrarAtajo` nunca lanza y descarta a los rastreadores: este enlace
 * existe para llevar a alguien al perfil, y la analítica no puede estorbar eso.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  await registrarAtajo("/ig", {
    userAgent: request.headers.get("user-agent"),
    referer: request.headers.get("referer"),
  });

  // 307 a mano y no `Response.redirect()` para poder añadir el `no-store`:
  // una redirección cacheada en la CDN dejaría de pasar por aquí y el clic
  // no se contaría.
  return new Response(null, {
    status: 307,
    headers: { Location: perfilInstagram(), "Cache-Control": "no-store" },
  });
}
