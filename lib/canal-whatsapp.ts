import { enlaceWhatsapp } from "@/lib/atajos";

/**
 * Arma el mensaje para el canal de WhatsApp a partir del caption ya publicado
 * en Instagram.
 *
 * No existe API gratuita de Meta para publicar en un Canal de WhatsApp, y la
 * única alternativa automatizada es una librería no oficial (tipo Baileys)
 * que arriesga el número por violar los términos de servicio — así que el
 * envío es manual. Esta función solo da formato: el admin copia el resultado
 * y lo pega a mano en el canal.
 */

function sitioUrl(): string {
  const url = process.env.SITE_URL;
  if (!url) throw new Error("Falta configurar SITE_URL");
  return url;
}

/**
 * Los tres constructores de caption (`lib/caption.ts`) siempre terminan el
 * cuerpo con una línea en blanco y después los hashtags en un único párrafo.
 * El mensaje del canal no los necesita —ahí no cumplen ninguna función—, así
 * que se descarta el último bloque si es justo eso.
 */
function quitarHashtags(caption: string): string {
  const bloques = caption.split("\n\n");
  const ultimo = bloques[bloques.length - 1];
  if (ultimo?.trimStart().startsWith("#")) bloques.pop();
  return bloques.join("\n\n");
}

export function formatMensajeCanal(input: { caption: string | null; permalinkPost: string }): string {
  const cuerpo = input.caption ? quitarHashtags(input.caption) : "";
  const canal = enlaceWhatsapp();

  // La línea del canal se omite si no está configurado, en vez de inventar un
  // enlace — mismo criterio que ya usa `enlaceWhatsapp()` en `next.config.ts`.
  const pie = [
    `👉 Post completo: ${input.permalinkPost}`,
    `🧮 Calculadora: ${sitioUrl()}`,
    canal ? `📢 Únete al canal: ${canal}` : null,
  ].filter((linea): linea is string => linea !== null);

  return [cuerpo, pie.join("\n")].filter((bloque) => bloque.length > 0).join("\n\n");
}
