import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import type { DatosCintillo } from "@/lib/og-cintillo";
import { VERSION_CINTILLO, generarCintillo } from "@/lib/og-cintillo";

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
  extra: Record<string, unknown> = {},
): Promise<UploadApiResponse> {
  const client = configurar();
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      { resource_type: resourceType, public_id: publicId, ...extra },
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary no devolvió resultado"));
        else resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/**
 * `true` en cuanto se confirma (o se sube) el logo una vez en este proceso.
 * El `public_id` es fijo y el logo no cambia, así que no hace falta volver a
 * preguntarle a Cloudinary por él en cada URL de video que se compone —cada
 * `urlVideoConMarca`/`urlDescargaVideo`/`urlFotogramaConMarca` llama a
 * `asegurarLogo()` por su cuenta, así que sin esta bandera una sola vista
 * previa de un carrusel con varios videos dispara varias llamadas al Admin
 * API por algo que ya se sabe que existe.
 */
let logoConfirmado = false;

/**
 * Sube el logo una sola vez: `public_id` fijo, así que en las siguientes
 * llamadas basta comprobar que ya existe en vez de volver a subirlo. Y una
 * vez confirmado en este proceso, ni eso: ver `logoConfirmado`.
 */
async function asegurarLogo(): Promise<void> {
  if (logoConfirmado) return;
  const client = configurar();
  try {
    await client.api.resource(LOGO_PUBLIC_ID, { resource_type: "image" });
  } catch {
    const buffer = await readFile(path.join(process.cwd(), "public/icon-512.png"));
    await subirBuffer(buffer, "image", LOGO_PUBLIC_ID);
  }
  logoConfirmado = true;
}

export interface MediaSubido {
  publicId: string;
  resourceType: "image" | "video";
  bytes: number;
}

/**
 * Permiso de subida directa desde el navegador a Cloudinary.
 *
 * Las credenciales no viajan enteras: sale la `api_key` (que es pública por
 * diseño) y una firma de un solo uso calculada con el secreto, que se queda
 * aquí. Sin `timestamp` reciente y firma válida, Cloudinary rechaza la subida.
 */
export interface PermisoSubida {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  maxBytes: number;
}

/**
 * Firma una subida directa navegador → Cloudinary.
 *
 * El archivo ya no pasa por nuestro servidor, y no es una optimización sino la
 * única forma de que entre: en Vercel el cuerpo de una petición a una función
 * tiene un tope de ~4,5 MB, así que un video de 18 MB moría con un 413 de la
 * plataforma antes de llegar a ningún código nuestro.
 *
 * Se firma **solo** el `timestamp`. La firma de Cloudinary cubre exactamente
 * los parámetros incluidos, de modo que dejar fuera todo lo demás implica que
 * el navegador tampoco puede añadir ninguno: cualquier parámetro extra invalida
 * la firma. El `resource_type` no se firma porque viaja en la ruta, no en el
 * cuerpo.
 *
 * El tope de tamaño se devuelve en vez de duplicarse en el cliente: al no ver
 * ya el archivo, el servidor no puede medirlo, pero sigue siendo quien decide
 * cuál es el límite.
 */
export function firmarSubidaDirecta(): PermisoSubida {
  // `configurar()` es lo que garantiza que las tres variables existen.
  const client = configurar();
  const timestamp = Math.round(Date.now() / 1000);

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    timestamp,
    signature: client.utils.api_sign_request({ timestamp }, process.env.CLOUDINARY_API_SECRET!),
    maxBytes: MAX_BYTES,
  };
}

export interface ItemMedia {
  publicId: string;
  resourceType: "image" | "video";
  format: string;
  url: string;
  createdAt: string;
  bytes: number;
}

export interface PaginaMedia {
  items: ItemMedia[];
  siguienteCursor?: string;
}

/**
 * `public_id`s que nunca deben salir en el selector de "elegir de la
 * biblioteca": son recursos de sistema (logo, sello, cintillos generados),
 * no material que un admin pudiera querer reutilizar como imagen o video de
 * una noticia.
 */
const PREFIJOS_EXCLUIDOS = ["cintillo_"];

/**
 * Lista lo ya subido a Cloudinary, para el selector de `/admin/noticia` que
 * evita volver a subir un archivo que ya está en la cuenta.
 *
 * Usa el Admin API (`resources`) y no el Search API: no hay ninguna prueba de
 * que la cuenta tenga ese complemento habilitado, y para listar por tipo con
 * paginación por cursor alcanza con el primero, que sí viene con el plan
 * gratuito.
 */
export async function listarMedia(opciones: {
  tipo: "image" | "video";
  cursor?: string;
  limite?: number;
}): Promise<PaginaMedia> {
  const client = configurar();
  const respuesta = await client.api.resources({
    resource_type: opciones.tipo,
    type: "upload",
    max_results: opciones.limite ?? 30,
    next_cursor: opciones.cursor,
    direction: "desc",
  });

  // `LOGO_PUBLIC_ID` y `SELLO_PUBLIC_ID` son recursos de sistema, no material
  // que un admin quiera reutilizar como imagen o video de una noticia.
  const publicIdsExcluidos = [LOGO_PUBLIC_ID, SELLO_PUBLIC_ID];

  const items: ItemMedia[] = (respuesta.resources as Array<Record<string, string | number>>)
    .filter(
      (r) =>
        !publicIdsExcluidos.includes(r.public_id as string) &&
        !PREFIJOS_EXCLUIDOS.some((prefijo) => (r.public_id as string).startsWith(prefijo)),
    )
    .map((r) => ({
      publicId: r.public_id as string,
      resourceType: opciones.tipo,
      format: r.format as string,
      url: r.secure_url as string,
      createdAt: r.created_at as string,
      bytes: r.bytes as number,
    }));

  return { items, siguienteCursor: respuesta.next_cursor };
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

/** Tope de caracteres del crédito: más largo no entra a lo ancho del cintillo. */
const MAX_FUENTE = 48;

/**
 * Normaliza el crédito tal como se teclea en `/admin/noticia`.
 *
 * La sustitución de `,` `/` `%` `#` `?` viene de cuando el texto viajaba dentro
 * del **path** de la URL de Cloudinary, donde esos caracteres son separadores y
 * partían la transformación. Hoy el crédito se dibuja en el PNG del cintillo y
 * ya no toca ninguna URL, pero se conserva como saneado: no cuesta nada y
 * mantiene los créditos cortos y uniformes.
 *
 * Devuelve `undefined` cuando no queda nada que pintar, de modo que "activada
 * pero en blanco" se comporte igual que "desactivada" y no salga una banda que
 * solo diga `Fuente:`.
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
 * Sube el cintillo de un video y devuelve su `public_id`, generándolo solo la
 * primera vez.
 *
 * El `public_id` se deriva del contenido: el mismo titular y la misma fuente
 * dan el mismo identificador, así que el asset se reutiliza en vez de dejar uno
 * nuevo por cada pulsación de "Actualizar vista previa" en una cuenta con 25
 * créditos al mes.
 *
 * **Sube siempre, con `overwrite: false`.** La versión anterior seguía el
 * patrón de `asegurarLogo()` —preguntar por el recurso y subirlo solo si la
 * consulta fallaba— y con eso el cintillo no llegaba nunca al video: si esa
 * consulta no lanza para un `public_id` inexistente, no se sube nada y la URL
 * acaba apuntando a un asset fantasma. Y ahí no hay error que avise, porque
 * Cloudinary, sobre video, **ignora en silencio** una capa que no encuentra y
 * sirve el clip sin ella (verificado en producción: salía el sello y no el
 * cintillo, sin ningún fallo por medio).
 *
 * Subir siempre elimina esa suposición: al componer la URL, el PNG está. Con
 * `overwrite: false` una subida repetida no reemplaza nada ni gasta
 * almacenamiento extra, y de paso vuelve inofensivo que dos llamadas
 * concurrentes pidan el mismo cintillo a la vez.
 *
 * `VERSION_CINTILLO` entra en el hash a propósito: si se cambia el diseño de
 * la plantilla sin subirla, los videos seguirían sirviendo el PNG viejo que ya
 * está cacheado con ese identificador.
 *
 * `cintillosSubidos` guarda, dentro de este mismo proceso, qué `public_id`s ya
 * se confirmaron subidos: una sola vista previa llama a esta función dos
 * veces para el mismo video (una para la URL de reproducción, otra para la de
 * descarga — `previewNewsVideoPost` en `lib/publish-news.ts`), y un carrusel
 * repite eso por cada elemento de video. Sin este set, cada una de esas
 * llamadas reintenta la subida completa aunque el PNG sea idéntico al que
 * acaba de subir la llamada anterior. Esto **no** reintroduce el bug que años
 * atrás dejó cintillos sin aplicar: aquí solo se salta la subida cuando *esta
 * misma función, en esta misma ejecución del proceso*, ya la confirmó — nunca
 * se asume que existe solo por el nombre. Un proceso nuevo (cold start)
 * empieza con el set vacío y sube de verdad la primera vez, igual que hoy.
 */
const cintillosSubidos = new Set<string>();

async function asegurarCintillo(datos: DatosCintillo): Promise<string> {
  const huella = createHash("sha256")
    .update(JSON.stringify({ ...datos, v: VERSION_CINTILLO }))
    .digest("base64url")
    .slice(0, 16);
  const publicId = `cintillo_${huella}`;

  if (cintillosSubidos.has(publicId)) return publicId;

  await subirBuffer(await generarCintillo(datos), "image", publicId, {
    overwrite: false,
    invalidate: false,
  });
  cintillosSubidos.add(publicId);
  return publicId;
}

/**
 * Formato de salida del video, que no es una preferencia estética sino una
 * exigencia de Instagram:
 *
 * - `reel`: 9:16, lo único que entra en la pestaña de Reels.
 * - `carrusel`: 1:1, y `carrusel-4-5`: 4:5 — las dos proporciones que Meta
 *   admite para el primer elemento de un carrusel. En un carrusel **todos**
 *   los elementos deben compartir la relación de aspecto del primero: si se
 *   mezclan, Meta rechaza el contenedor padre.
 */
export type FormatoVideo = "reel" | "carrusel" | "carrusel-4-5";

const LIENZO: Record<FormatoVideo, { width: number; height: number }> = {
  reel: { width: 1080, height: 1920 },
  carrusel: { width: 1080, height: 1080 },
  "carrusel-4-5": { width: 1080, height: 1350 },
};

/**
 * El sello se pensó para el lienzo de un Reel (1920 px de alto), donde
 * `y: 800` lo deja a media altura. Copiar ese número tal cual a un lienzo
 * más bajo (carrusel 1:1 o 4:5) lo descuadra, así que se recalcula
 * proporcional a la altura de cada lienzo en vez de repetir el literal.
 */
function yDelSello(altoLienzo: number): number {
  return Math.round(altoLienzo * (800 / 1920));
}

/**
 * Margen del cintillo respecto al borde inferior, proporcional por el mismo
 * motivo que `yDelSello`: un literal pensado para los 1920 px de un Reel se
 * descuadra en un lienzo de 1080 o 1350.
 */
function yDelCintillo(altoLienzo: number): number {
  return Math.round(altoLienzo * (150 / 1920));
}

/**
 * Lo que se le superpone a un video: el cintillo de noticiero y por cuánto
 * tiempo. Va agrupado en vez de como parámetros sueltos porque lo arrastran
 * cuatro puntos de llamada distintos (el principal del carrusel, cada extra,
 * el Reel y `calentarVideo`).
 */
export interface MarcaVideo {
  /** Titular del cintillo. Sin él —y sin `fuente`— no se superpone ninguna banda. */
  titulo?: string;
  /** Crédito de quien grabó el clip. Solo sale si se pide. */
  fuente?: string;
  /** Segundos que dura el cintillo en pantalla. Sin valor, dura todo el clip. */
  segundos?: number;
}

/** ¿Hay algo que pintar? Sin título ni fuente, el video va solo con los sellos. */
function llevaCintillo(marca: MarcaVideo): boolean {
  return Boolean(marca.titulo?.trim() || limpiarFuente(marca.fuente));
}

/**
 * Encuadre + sello de marca y, abajo, el cintillo de noticiero **si se pidió**:
 * el material propio sin titular ni crédito no tiene nada que anunciar, y una
 * banda vacía solo le quita sitio al video.
 *
 * El cintillo entra como **una sola capa ya compuesta** (ver `lib/og-cintillo.tsx`).
 * Antes el crédito se pintaba con el motor de texto de Cloudinary, en Arial y
 * con el texto viajando dentro del path de la URL; se retiró a propósito, y no
 * conviene reintroducirlo: un titular real lleva comas, que ahí separan
 * parámetros.
 *
 * Tres detalles que costó encontrar y conviene no deshacer:
 *
 * - La posición va en el componente de `layer_apply`, **no** junto al overlay:
 *   puesta junto al overlay, Cloudinary la ignora en silencio y centra ambas
 *   capas encima del video (verificado en vivo).
 * - El encuadre va **primero**, antes de las capas. Al revés, los tamaños del
 *   logo y del cintillo se calculan contra el lienzo original y quedan
 *   descuadrados al escalar.
 * - Sin `so_`/`eo_`, Cloudinary aplica el overlay a toda la duración del clip.
 *   `segundos` es lo que lo acota para que el cintillo entre y salga.
 *
 * Se encaja con `pad` y no con `fill`: recortar perdería los bordes del
 * encuadre original del video, que es contenido que el usuario grabó.
 *
 * Vive aparte porque la comparten el video que se publica y el fotograma con
 * el que se revisa la marca: si divergieran, lo revisado dejaría de ser lo
 * publicado.
 */
function transformacionMarca(
  formato: FormatoVideo,
  cintilloPublicId?: string,
  segundos?: number,
) {
  return [
    { ...LIENZO[formato], crop: "pad", background: "#0b1120" },
    { overlay: SELLO_PUBLIC_ID, width: 800, crop: "scale", opacity: 10 },
    { flags: "layer_apply", gravity: "north_west", x: 150, y: yDelSello(LIENZO[formato].height) },
    ...(cintilloPublicId
      ? [
          { overlay: cintilloPublicId, width: LIENZO[formato].width, crop: "scale" },
          {
            flags: "layer_apply",
            gravity: "south",
            y: yDelCintillo(LIENZO[formato].height),
            // Acotar la capa en el tiempo es lo que hace que el cintillo entre
            // y salga como en un noticiero, en vez de quedarse todo el clip.
            ...(segundos ? { start_offset: "0", end_offset: String(segundos) } : {}),
          },
        ]
      : []),
  ];
}

/**
 * Resuelve el cintillo de un video: `undefined` cuando no lleva ninguno.
 * Aparte de `transformacionMarca` porque generar el PNG es asíncrono y la
 * transformación no puede serlo.
 */
async function cintilloDe(marca: MarcaVideo): Promise<string | undefined> {
  return llevaCintillo(marca)
    ? asegurarCintillo({ titulo: marca.titulo?.trim() || undefined, fuente: limpiarFuente(marca.fuente) })
    : undefined;
}

/**
 * Formato de salida del video entregado. Fijo a `mp4` a propósito: sin un
 * `format` explícito, Cloudinary resuelve la extensión de la URL de forma
 * ambigua —y `fl_attachment` la necesita para saber con qué extensión
 * anunciar la descarga—; verificado en vivo, sin esto el navegador terminaba
 * guardando el video como `.gif`. `urlFotogramaConMarca` y `urlImagen` ya
 * seguían este mismo patrón (`jpg`/`png`); aquí faltaba.
 */
const FORMATO_VIDEO_ENTREGADO = "mp4";

/**
 * URL pública del video ya marcado. Sin `titulo` ni `fuente`, el video sale
 * solo con el sello, que es el caso del material propio sin acreditar.
 */
export async function urlVideoConMarca(
  publicId: string,
  formato: FormatoVideo,
  marca: MarcaVideo = {},
): Promise<string> {
  await asegurarLogo();
  const cintillo = await cintilloDe(marca);
  const client = configurar();
  return client.url(publicId, {
    resource_type: "video",
    secure: true,
    format: FORMATO_VIDEO_ENTREGADO,
    transformation: transformacionMarca(formato, cintillo, marca.segundos),
  });
}

/**
 * La misma URL, pero que el navegador descarga en vez de reproducir.
 *
 * El atributo `download` de HTML no sirve aquí: se ignora en recursos de otro
 * origen, y el video lo sirve Cloudinary. `fl_attachment` hace que responda
 * con `Content-Disposition: attachment`, que sí funciona entre orígenes.
 *
 * Reutiliza `transformacionMarca()` a propósito: lo que se descarga tiene que
 * ser exactamente lo que se publicaría, no el original sin marcar.
 */
export async function urlDescargaVideo(
  publicId: string,
  formato: FormatoVideo,
  marca: MarcaVideo = {},
): Promise<string> {
  await asegurarLogo();
  const cintillo = await cintilloDe(marca);
  const client = configurar();
  return client.url(publicId, {
    resource_type: "video",
    secure: true,
    format: FORMATO_VIDEO_ENTREGADO,
    transformation: [...transformacionMarca(formato, cintillo, marca.segundos), { flags: "attachment" }],
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
  opciones: { segundo?: number } & MarcaVideo = {},
): Promise<string> {
  await asegurarLogo();
  const { segundo, ...marca } = opciones;
  const cintillo = await cintilloDe(marca);
  const client = configurar();
  return client.url(publicId, {
    resource_type: "video",
    secure: true,
    format: "jpg",
    start_offset: String(segundo ?? 0),
    transformation: transformacionMarca(formato, cintillo, marca.segundos),
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
