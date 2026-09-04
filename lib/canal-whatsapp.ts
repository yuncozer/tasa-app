import { conPieEnlaces, esCaptionDiario, type VariantePie } from "@/lib/caption";
import { anotarImagenEnlace, leerEnlace, slugParaPermalink } from "@/lib/enlaces";
import { subirDesdeUrl } from "@/lib/providers/cloudinary";

/**
 * Arma el mensaje para el canal de WhatsApp a partir del caption ya publicado
 * en Instagram.
 *
 * No existe API gratuita de Meta para publicar en un Canal de WhatsApp, y la
 * única alternativa automatizada es una librería no oficial (tipo Baileys) que
 * arriesga el número por violar los términos de servicio — así que el envío es
 * manual. Esta función solo da formato: el admin copia el resultado y lo pega
 * a mano en el canal.
 *
 * **Este es el único sitio donde vive el pie de tres enlaces.** En Instagram no
 * se publica: la plataforma no vuelve clicables los enlaces dentro del caption,
 * así que allí los posts cierran en sus hashtags (o en "link en la bio", el
 * diario y el semanal). En WhatsApp sí se pueden tocar.
 *
 * **Ningún post sale ya con el permalink crudo de Instagram**, y ese es el
 * cambio importante. Un permalink pegado en WhatsApp se topa con el muro de
 * login, sin `og:image`: es exactamente el motivo por el que `/hoy` existe
 * como página y no como redirección. Pasando por un atajo propio, la vista
 * previa la sirve este dominio y además el clic se cuenta — hasta ahora, de
 * todo lo que se mandaba al canal que no fuera el post diario no se sabía
 * absolutamente nada.
 *
 * Tres destinos, en este orden:
 *
 * 1. **`/hoy`** para el post diario de tasas.
 * 2. **`/laparada`** para el post de La Parada.
 * 3. **`/e/<slug>`** para todo lo demás.
 *
 * Los dos primeros solo se usan si de verdad apuntan **a ese post**: son
 * atajos que resuelven siempre al más reciente de su serie, así que compartir
 * el diario de anteayer con `/hoy` mandaría al lector a otra publicación
 * distinta de la que describe el mensaje. Cuando no coinciden se cae a
 * `/e/<slug>`, que apunta al post exacto.
 */

/** El destino elegido y qué línea lo tiene que preceder. */
interface Destino {
  url: string;
  variante: VariantePie;
}

/**
 * A qué post apunta ahora mismo un atajo fijo. Nunca lanza: sin respuesta se
 * comporta como si no coincidiera, y el post sale por `/e/<slug>`.
 */
async function apuntaA(clave: "hoy" | "laparada", permalink: string): Promise<boolean> {
  try {
    return (await leerEnlace(clave)) === permalink;
  } catch {
    return false;
  }
}

/**
 * Copia la miniatura del post a Cloudinary y la anota, para que la tarjeta de
 * `/e/<slug>` lleve la foto en vez de ser un cuadro de texto.
 *
 * **No se guarda la URL de Instagram**: las de `scontent-*.cdninstagram.com`
 * vienen firmadas y caducan —medido sobre esta cuenta, 4,5 días— así que la
 * tarjeta se rompería sola justo en los posts que más tiempo llevan
 * circulando.
 *
 * **Solo se copia la primera vez.** `slugParaPermalink` devuelve la imagen que
 * ya tuviera el enlace justamente para poder saltarse esto: la pantalla del
 * canal se renderiza en cada visita, y sin la guarda cada una dejaba una copia
 * nueva en Cloudinary. Y si algo falla, se ignora — la tarjeta sale genérica y
 * el enlace funciona igual, mismo criterio que `calentarVideo()`.
 */
async function asegurarMiniatura(
  slug: string,
  imagenUrl: string | null,
  yaTiene: string | null,
): Promise<void> {
  if (!imagenUrl || yaTiene) return;

  try {
    await anotarImagenEnlace(slug, await subirDesdeUrl(imagenUrl));
  } catch {
    // Una miniatura que no se pudo copiar no puede impedir compartir el post.
  }
}

async function elegirDestino(input: {
  caption: string;
  permalinkPost: string;
  imagenUrl: string | null;
  sitio: string | undefined;
}): Promise<Destino> {
  const { caption, permalinkPost, imagenUrl, sitio } = input;

  // Sin `SITE_URL` no se puede construir ningún atajo propio, así que se
  // vuelve al permalink en vez de armar un enlace roto.
  if (!sitio) return { url: permalinkPost, variante: "tasas" };

  if (esCaptionDiario(caption) && (await apuntaA("hoy", permalinkPost))) {
    return { url: `${sitio}/hoy`, variante: "tasas" };
  }

  if (await apuntaA("laparada", permalinkPost)) {
    return { url: `${sitio}/laparada`, variante: "tasas" };
  }

  const enlace = await slugParaPermalink(permalinkPost);
  if (!enlace) return { url: permalinkPost, variante: "post" };

  await asegurarMiniatura(enlace.clave, imagenUrl, enlace.imagen);
  return { url: `${sitio}/e/${enlace.clave}`, variante: "post" };
}

export async function formatMensajeCanal(input: {
  caption: string | null;
  permalinkPost: string;
  /** La miniatura que devuelve la Graph API, para copiarla la primera vez. */
  imagenUrl?: string | null;
}): Promise<string> {
  const caption = input.caption ?? "";

  const destino = await elegirDestino({
    caption,
    permalinkPost: input.permalinkPost,
    imagenUrl: input.imagenUrl ?? null,
    sitio: process.env.SITE_URL,
  });

  return conPieEnlaces(caption, destino.url, destino.variante);
}
