import { conPieEnlaces } from "@/lib/caption";

/**
 * Arma el mensaje para el canal de WhatsApp a partir del caption ya publicado
 * en Instagram.
 *
 * No existe API gratuita de Meta para publicar en un Canal de WhatsApp, y la
 * única alternativa automatizada es una librería no oficial (tipo Baileys)
 * que arriesga el número por violar los términos de servicio — así que el
 * envío es manual. Esta función solo da formato: el admin copia el resultado
 * y lo pega a mano en el canal.
 *
 * Todo caption ya publicado (diario o de noticia) termina con el mismo pie de
 * enlaces (`pieEnlaces` en `lib/caption.ts`), pero apuntando a `/hoy` o
 * `/p/<slug>` — un atajo, porque al armar el caption el permalink real
 * todavía no existe. Aquí sí lo tenemos (`permalinkPost` sale de la Graph
 * API, del post que se está mirando), así que `conPieEnlaces` reconstruye el
 * mismo pie pero con el enlace directo en vez del atajo.
 */
export function formatMensajeCanal(input: { caption: string | null; permalinkPost: string }): string {
  return conPieEnlaces(input.caption ?? "", input.permalinkPost);
}
