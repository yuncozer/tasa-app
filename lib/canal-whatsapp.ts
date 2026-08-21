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
 * **Este es el único sitio donde vive el pie de tres enlaces.** En Instagram
 * no se publica: la plataforma no vuelve clicables los enlaces dentro del
 * caption, así que allí los posts cierran en sus hashtags (o en "link en la
 * bio", el diario y el semanal). En WhatsApp sí se pueden tocar, y además
 * aquí ya se conoce el permalink real —`permalinkPost` sale de la Graph API,
 * del post que se está mirando—, de modo que el enlace va directo al post en
 * vez de pasar por un atajo como `/hoy` o `/p/<slug>`.
 *
 * `conPieEnlaces` corta antes el cierre que traiga el caption publicado
 * —hashtags, "link en la bio", o el pie de enlaces de los posts anteriores a
 * este cambio— y pone el suyo en su lugar.
 */
export function formatMensajeCanal(input: { caption: string | null; permalinkPost: string }): string {
  return conPieEnlaces(input.caption ?? "", input.permalinkPost);
}
