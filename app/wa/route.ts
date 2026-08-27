import { registrarAtajo } from "@/lib/analiticas-web";
import { enlaceWhatsapp } from "@/lib/atajos";

/**
 * `/wa`: el atajo al canal de WhatsApp. Mismo motivo que `/ig` para haber
 * dejado de ser un `redirects()`: en la CDN no corría código nuestro y el
 * clic no se podía contar.
 *
 * Sin `ENLACE_WHATSAPP` configurado la ruta **no existe** (404), igual que
 * antes: un número de WhatsApp no se adivina y uno inventado mandaría a un
 * chat ajeno (ver `lib/atajos.ts`).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const destino = enlaceWhatsapp();
  if (!destino) return new Response(null, { status: 404 });

  await registrarAtajo("/wa", {
    userAgent: request.headers.get("user-agent"),
    referer: request.headers.get("referer"),
  });

  // 307 a mano y no `Response.redirect()` para poder añadir el `no-store`:
  // una redirección cacheada en la CDN dejaría de pasar por aquí y el clic
  // no se contaría.
  return new Response(null, {
    status: 307,
    headers: { Location: destino, "Cache-Control": "no-store" },
  });
}
