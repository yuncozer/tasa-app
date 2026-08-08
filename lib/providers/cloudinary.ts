import { readFile } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

/**
 * Cloudinary hospeda lo que el usuario sube en `/admin/noticia` (imagen o
 * video propios) y genera, sobre esa misma URL, la franja de marca vía
 * transformación por URL — no hay ffmpeg ni Remotion aquí. Se eligió sobre
 * esas alternativas porque un overlay fijo durante todo el video es
 * exactamente una transformación de Cloudinary, y su free tier no exige
 * tarjeta ni cuenta de AWS, algo que sí piden las otras opciones evaluadas.
 */

const LOGO_PUBLIC_ID = "latasa_logo";
const MAX_BYTES = 100 * 1024 * 1024;

function configurar() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return cloudinary;
}

function subirBuffer(
  buffer: Buffer,
  resourceType: "image" | "video",
  publicId?: string,
): Promise<UploadApiResponse> {
  const client = configurar();
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      { resource_type: resourceType, public_id: publicId },
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary no devolvió resultado"));
        else resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/**
 * Sube el logo una sola vez: `public_id` fijo, así que en las siguientes
 * llamadas basta comprobar que ya existe en vez de volver a subirlo.
 */
async function asegurarLogo(): Promise<void> {
  const client = configurar();
  try {
    await client.api.resource(LOGO_PUBLIC_ID, { resource_type: "image" });
  } catch {
    const buffer = await readFile(path.join(process.cwd(), "public/icon-512.png"));
    await subirBuffer(buffer, "image", LOGO_PUBLIC_ID);
  }
}

export interface MediaSubido {
  publicId: string;
  resourceType: "image" | "video";
  bytes: number;
}

/** Sube un video o imagen propios (sin marca todavía) y valida el tamaño. */
export async function subirMedia(buffer: Buffer, resourceType: "image" | "video"): Promise<MediaSubido> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (100MB)");
  }
  const resultado = await subirBuffer(buffer, resourceType);
  return { publicId: resultado.public_id, resourceType, bytes: resultado.bytes };
}

/** Margen para descargar la foto de un artículo, igual que el del scraper. */
const TIMEOUT_DESCARGA_MS = 12_000;

/**
 * Copia a Cloudinary una imagen que vive en otro sitio, y devuelve su
 * `public_id`. La usa la programación de posts: un post programado no puede
 * depender de que el portal siga sirviendo la foto dentro de unas horas.
 *
 * La descarga la hace este servidor y no Cloudinary (que también sabe subir
 * desde una URL) porque el portal ya nos respondió una vez durante el
 * scraping, mientras que a Cloudinary podría bloquearlo.
 */
export async function subirDesdeUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_DESCARGA_MS),
  });
  if (!response.ok) throw new Error(`La imagen del artículo respondió ${response.status}`);

  const { publicId } = await subirMedia(Buffer.from(await response.arrayBuffer()), "image");
  return publicId;
}

const SELLO_PUBLIC_ID = "LaTasa_sello_transparencia_ch26p5";

/**
 * La franja de texto ya no lleva la marca —de eso se encargan los sellos
 * superpuestos, que van en todo video—, sino el crédito de quien grabó el
 * clip. El prefijo lo pone el código y no el usuario: así todos los posts lo
 * dicen igual y no se cuela un video acreditado a medias.
 */
const PREFIJO_FUENTE = "Fuente: ";

/** Tope de caracteres del crédito: más largo no entra a lo ancho del lienzo. */
const MAX_FUENTE = 48;

/**
 * Normaliza el crédito tal como se teclea en `/admin/noticia`. El texto viaja
 * dentro del **path** de la URL de Cloudinary, así que los caracteres que ahí
 * son separadores (`,` entre parámetros, `/` entre componentes) partirían la
 * transformación en vez de dibujarse; se sustituyen en lugar de rechazarse
 * para no bloquear la publicación por un nombre con coma.
 *
 * Devuelve `undefined` cuando no queda nada que pintar, de modo que "activada
 * pero en blanco" se comporte igual que "desactivada" y no salga una franja
 * que solo diga `Fuente:`.
 */
export function limpiarFuente(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpio = valor
    .replace(/[,/%#?\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FUENTE)
    .trim();
  return limpio || undefined;
}

/**
 * Formato de salida del video, que no es una preferencia estética sino una
 * exigencia de Instagram:
 *
 * - `reel`: 9:16, lo único que entra en la pestaña de Reels.
 * - `carrusel`: 1:1, porque en un carrusel **todos** los elementos deben
 *   compartir relación de aspecto (la del primero manda) y la imagen de marca
 *   es cuadrada. Si se mezclan, Meta rechaza el contenedor padre.
 */
export type FormatoVideo = "reel" | "carrusel";

const LIENZO: Record<FormatoVideo, { width: number; height: number }> = {
  reel: { width: 1080, height: 1920 },
  carrusel: { width: 1080, height: 1080 },
};

/**
 * Encuadre + sellos de marca, y abajo la franja con el crédito de la fuente
 * **solo si se pidió uno**: el material propio no tiene a quién acreditar y una
 * franja vacía solo le quita sitio al video. Sin `so_`/`eo_` en la
 * transformación, Cloudinary aplica los overlays a toda la duración del clip
 * por defecto.
 *
 * Dos detalles que costó encontrar y conviene no deshacer:
 *
 * - La posición va en el componente de `layer_apply`, **no** junto al overlay:
 *   puesta junto al overlay, Cloudinary la ignora en silencio y centra ambas
 *   capas encima del video (verificado en vivo).
 * - El encuadre va **primero**, antes de las capas. Al revés, los tamaños del
 *   logo y del texto se calculan contra el lienzo original y quedan
 *   descuadrados al escalar.
 *
 * Se encaja con `pad` y no con `fill`: recortar perdería los bordes del
 * encuadre original del video, que es contenido que el usuario grabó.
 *
 * Vive aparte porque la comparten el video que se publica y el fotograma con
 * el que se revisa la marca: si divergieran, lo revisado dejaría de ser lo
 * publicado.
 */
function transformacionMarca(formato: FormatoVideo, fuente?: string) {
  const credito = limpiarFuente(fuente);

  return [
    { ...LIENZO[formato], crop: "pad", background: "#0b1120" },
    { overlay: SELLO_PUBLIC_ID, width: 800, crop: "scale", opacity: 20 },
    { flags: "layer_apply", gravity: "north_west", x: 150, y: 200 },
    { overlay: SELLO_PUBLIC_ID, width: 800, crop: "scale", opacity: 20 },
    { flags: "layer_apply", gravity: "north_west", x: 150, y: 800 },
    { overlay: SELLO_PUBLIC_ID, width: 800, crop: "scale", opacity: 20 },
    { flags: "layer_apply", gravity: "north_west", x: 150, y: 1400 },
    ...(credito
      ? [
          {
            overlay: {
              font_family: "Arial",
              font_size: 38,
              font_weight: "bold",
              text: `${PREFIJO_FUENTE}${credito}`,
            },
            color: "#f8f9fa",
            background: "#0b1120",
          },
          { flags: "layer_apply", gravity: "south", y: 150 },
        ]
      : []),
  ];
}

/**
 * URL pública del video ya marcado. `fuente` es opcional: sin ella el video
 * sale solo con los sellos, que es el caso del material propio.
 */
export async function urlVideoConMarca(
  publicId: string,
  formato: FormatoVideo,
  fuente?: string,
): Promise<string> {
  await asegurarLogo();
  const client = configurar();
  return client.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: transformacionMarca(formato, fuente),
  });
}

/**
 * Un fotograma del video ya marcado, como imagen. Es la forma fiable de
 * revisar la marca sin publicar nada: mirar un JPG es inmediato y deja algo
 * que se puede comparar después, mientras que reproducir el clip entero tarda
 * y no deja rastro. Lo usa `scripts/preview-marca.ts`.
 */
export async function urlFotogramaConMarca(
  publicId: string,
  formato: FormatoVideo,
  opciones: { segundo?: number; fuente?: string } = {},
): Promise<string> {
  await asegurarLogo();
  const client = configurar();
  return client.url(publicId, {
    resource_type: "video",
    secure: true,
    format: "jpg",
    start_offset: String(opciones.segundo ?? 0),
    transformation: transformacionMarca(formato, opciones.fuente),
  });
}

/**
 * URL pública de una imagen propia subida, transcodificada a PNG por
 * Cloudinary. Se le pide el formato aquí (no se deja en manos de `sharp` en
 * `instagram-post-news`) porque el teléfono puede subir HEIC, que Cloudinary
 * transcodifica de forma confiable y `sharp` no garantiza soportar.
 */
export function urlImagen(publicId: string): string {
  const client = configurar();
  return client.url(publicId, { resource_type: "image", secure: true, format: "png" });
}
