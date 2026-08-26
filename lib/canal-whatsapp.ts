import { conPieEnlaces, esCaptionDiario } from "@/lib/caption";

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
 * vez de pasar por un atajo como `/p/<slug>`.
 *
 * **Excepto el post diario de tasas**, que sí tiene un atajo mejor: `/hoy`,
 * el mismo que ya usa el propio caption publicado y que resuelve siempre al
 * último post de tasas con su propia vista previa. `esCaptionDiario()` lo
 * detecta por el propio texto del caption, sin heurística de fecha. Sin
 * `SITE_URL` configurado se cae al permalink de siempre, en vez de construir
 * un enlace roto.
 *
 * `conPieEnlaces` corta antes el cierre que traiga el caption publicado
 * —hashtags, "link en la bio", o el pie de enlaces de los posts anteriores a
 * este cambio— y pone el suyo en su lugar.
 */
export function formatMensajeCanal(input: { caption: string | null; permalinkPost: string }): string {
  const caption = input.caption ?? "";
  const sitio = process.env.SITE_URL;
  const destino = esCaptionDiario(caption) && sitio ? `${sitio}/hoy` : input.permalinkPost;

  return conPieEnlaces(caption, destino);
}
