import { buildNewsCaption } from "@/lib/caption";
import type { ElementoCarrusel } from "@/lib/instagram";
import { publishCarousel, publishDailyPost, publishReel } from "@/lib/instagram";
import { signNewsImageParams } from "@/lib/news-signature";
import { subirDesdeUrl, urlImagen, urlVideoConMarca } from "@/lib/providers/cloudinary";
import type { ArticleData } from "@/lib/providers/news";
import { fetchArticle } from "@/lib/providers/news";
import { esUrlValida } from "@/lib/validar-url";

/**
 * Arma la URL firmada de `instagram-post-news`. El título es opcional: las
 * diapositivas secundarias de un carrusel no lo llevan (ni la fecha), porque
 * repetirlo en cada una no aporta nada y le quita sitio a la foto.
 */
function armarUrlImagenFirmada(params: { title?: string; image: string; source: string }): string {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("Falta configurar SITE_URL");

  // Sin título, la clave se omite del todo en vez de ir vacía: la ruta firma
  // exactamente los parámetros que recibe, y un `title=` de más no cuadraría.
  const firmados: Record<string, string> = params.title
    ? { title: params.title, image: params.image, source: params.source }
    : { image: params.image, source: params.source };

  const sig = signNewsImageParams(firmados);
  const url = new URL(`${siteUrl}/api/og/instagram-post-news`);
  for (const [key, value] of Object.entries(firmados)) url.searchParams.set(key, value);
  url.searchParams.set("sig", sig);
  return url.toString();
}

/**
 * Arma el post de noticia (imagen firmada + caption) sin publicarlo. La
 * usan `previewNewsPost` (para mostrar la vista previa) y `publishNewsPost`
 * (que además dispara la publicación) — un solo lugar que scrapea, arma el
 * caption y firma los parámetros de la imagen.
 *
 * `imagenPropiaPublicId`, si viene, reemplaza la foto scrapeada por una que
 * el usuario subió desde `/admin/noticia` (quiere sumar contenido visual
 * propio a una noticia real, sin perder el título/fuente/caption scrapeados).
 */
async function buildNewsPost(
  url: string,
  imagenPropiaPublicId?: string,
): Promise<{ article: ArticleData; caption: string; imageUrl: string }> {
  const article = await fetchArticle(url);
  const caption = buildNewsCaption(article);
  const imagenFuente = imagenPropiaPublicId ? urlImagen(imagenPropiaPublicId) : article.imageUrl;
  const imageUrl = armarUrlImagenFirmada({ title: article.title, image: imagenFuente, source: article.sourceHost });

  return { article, caption, imageUrl };
}

/** Vista previa: mismo resultado que se publicaría, sin publicarlo. */
export async function previewNewsPost(
  url: string,
  imagenPropiaPublicId?: string,
): Promise<{ article: ArticleData; caption: string; imageUrl: string }> {
  return buildNewsPost(url, imagenPropiaPublicId);
}

/**
 * Publica un post ocasional a partir de la URL de un artículo. La usan
 * tanto `app/api/publish-instagram-news` (protegida con `CRON_SECRET`, para
 * disparo manual por curl) como `app/api/admin/publish-noticia` (protegida
 * por la cookie de sesión de `/admin`) — misma lógica, dos formas distintas
 * de autorizar quién puede dispararla.
 *
 * `captionOverride` existe para `/admin/noticia`: ahí se puede editar el
 * caption a mano (agregar párrafos que el scraper no trajo, por ejemplo)
 * antes de publicar. Sin ella, se usa el caption armado por plantilla.
 */
export async function publishNewsPost(
  url: string,
  captionOverride?: string,
  imagenPropiaPublicId?: string,
): Promise<{ mediaId: string }> {
  const { imageUrl, caption } = await buildNewsPost(url, imagenPropiaPublicId);
  return publishDailyPost(imageUrl, captionOverride ?? caption);
}

/**
 * Noticia de autoría propia: sin scraping — título, fuente y caption los
 * escribe el usuario en `/admin/noticia`, y la imagen es una que él mismo
 * sube. Reutiliza la misma plantilla firmada que la noticia scrapeada,
 * porque visualmente es exactamente el mismo marco de marca.
 */
export interface NoticiaManual {
  title: string;
  sourceHost: string;
  caption: string;
  imagenPublicId: string;
}

export function previewManualNewsPost(datos: NoticiaManual): { imageUrl: string } {
  const imageUrl = armarUrlImagenFirmada({
    title: datos.title,
    image: urlImagen(datos.imagenPublicId),
    source: datos.sourceHost,
  });
  return { imageUrl };
}

export async function publishManualNewsPost(datos: NoticiaManual): Promise<{ mediaId: string }> {
  const { imageUrl } = previewManualNewsPost(datos);
  return publishDailyPost(imageUrl, datos.caption);
}

/**
 * Video propio con la franja de marca superpuesta, publicado como Reel: va
 * solo y en 9:16, que es lo único que entra en la pestaña de Reels. Para
 * acompañarlo de imágenes en un mismo post está el carrusel de más abajo,
 * donde el mismo video se reencuadra a 1:1 y deja de ser un Reel.
 */
export async function previewNewsVideoPost(videoPublicId: string): Promise<{ videoUrl: string }> {
  const videoUrl = await urlVideoConMarca(videoPublicId, "reel");
  return { videoUrl };
}

export async function publishNewsVideoPost(videoPublicId: string, caption: string): Promise<{ mediaId: string }> {
  const { videoUrl } = await previewNewsVideoPost(videoPublicId);
  return publishReel(videoUrl, caption);
}

/**
 * Elementos que el usuario compone en `/admin/noticia` para un carrusel, en
 * el orden en que los ordenó. Las imágenes se identifican por su `public_id`
 * de Cloudinary y se envuelven en la plantilla de marca; el video se
 * reencuadra a 1:1.
 */
export type ElementoCarruselEntrada =
  | { tipo: "imagen"; publicId: string }
  | { tipo: "video"; publicId: string };

/**
 * De dónde sale la imagen principal del carrusel. Se resuelve en el servidor
 * y no se acepta una URL de imagen suelta del navegador: así la foto que se
 * enmarca sigue viniendo del artículo real o de Cloudinary, igual que en el
 * post de una sola imagen.
 */
export type PrincipalCarrusel =
  | { tipo: "articulo"; url: string }
  | { tipo: "subida"; publicId: string };

export interface CarruselEntrada {
  /** Título y fuente del marco de marca, comunes a todas las imágenes. */
  title: string;
  sourceHost: string;
  /**
   * Imagen que va siempre de primera: es la que da identidad al post y, por
   * cómo funciona Instagram, la que fija el formato de todo el carrusel.
   */
  principal: PrincipalCarrusel;
  /** Lo que el usuario añadió después, en el orden en que lo ordenó. */
  elementos: ElementoCarruselEntrada[];
}

/** Valida el origen de la imagen principal tal como llega del navegador. */
export function leerPrincipalCarrusel(valor: unknown): PrincipalCarrusel | null {
  const item = valor as { tipo?: unknown; url?: unknown; publicId?: unknown } | null;
  if (item?.tipo === "articulo" && esUrlValida(item.url as string)) {
    return { tipo: "articulo", url: item.url as string };
  }
  if (item?.tipo === "subida" && typeof item.publicId === "string" && item.publicId) {
    return { tipo: "subida", publicId: item.publicId };
  }
  return null;
}

/**
 * Valida la lista de elementos tal como llega del navegador. Vive aquí y no
 * en cada ruta porque la comparten la de vista previa y la de publicar.
 */
export function leerElementosCarrusel(valor: unknown): ElementoCarruselEntrada[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;

  const elementos: ElementoCarruselEntrada[] = [];
  for (const item of valor) {
    const tipo = item?.tipo;
    const publicId = item?.publicId;
    if ((tipo !== "imagen" && tipo !== "video") || typeof publicId !== "string" || !publicId) {
      return null;
    }
    elementos.push({ tipo, publicId });
  }
  return elementos;
}

/**
 * Arma las URLs finales del carrusel. Cada imagen pasa por la misma plantilla
 * firmada (`instagram-post-news`) que la imagen principal de una noticia:
 * nunca se publica una imagen cruda del usuario sin el marco de La Tasa.
 */
async function buildCarousel(datos: CarruselEntrada): Promise<ElementoCarrusel[]> {
  /** Sin `title`, el marco sale sin titular ni fecha: es la variante secundaria. */
  const enmarcar = (image: string, title?: string) =>
    armarUrlImagenFirmada({ title, image, source: datos.sourceHost });

  const principal =
    datos.principal.tipo === "subida"
      ? urlImagen(datos.principal.publicId)
      : (await fetchArticle(datos.principal.url)).imageUrl;

  const extras = await Promise.all(
    datos.elementos.map(async (elemento): Promise<ElementoCarrusel> => {
      if (elemento.tipo === "video") {
        return { tipo: "video", url: await urlVideoConMarca(elemento.publicId, "carrusel") };
      }
      return { tipo: "imagen", url: enmarcar(urlImagen(elemento.publicId)) };
    }),
  );

  return [{ tipo: "imagen", url: enmarcar(principal, datos.title) }, ...extras];
}

/** Vista previa del carrusel: las URLs reales que se publicarían, sin publicar. */
export async function previewCarouselPost(datos: CarruselEntrada): Promise<{ elementos: ElementoCarrusel[] }> {
  return { elementos: await buildCarousel(datos) };
}

export async function publishNewsCarouselPost(
  datos: CarruselEntrada,
  caption: string,
): Promise<{ mediaId: string }> {
  const elementos = await buildCarousel(datos);
  return publishCarousel(elementos, caption);
}

/**
 * Una publicación de `/admin/noticia`, en la forma exacta en que se ejecuta.
 * Existe para que publicar al instante y publicar programado sean **el mismo
 * camino**: si divergieran, lo que sale a la hora programada dejaría de ser lo
 * que se probó con el botón "Publicar".
 */
export type PublicacionPayload =
  | { tipo: "articulo"; url: string; caption?: string; imagenPublicId?: string }
  | { tipo: "manual"; datos: NoticiaManual }
  | { tipo: "carrusel"; datos: CarruselEntrada; caption: string }
  | { tipo: "reel"; videoPublicId: string; caption: string };

/** Única puerta de publicación: la usan las rutas inmediatas y el worker de la cola. */
export async function ejecutarPublicacion(payload: PublicacionPayload): Promise<{ mediaId: string }> {
  switch (payload.tipo) {
    case "articulo":
      return publishNewsPost(payload.url, payload.caption, payload.imagenPublicId);
    case "manual":
      return publishManualNewsPost(payload.datos);
    case "carrusel":
      return publishNewsCarouselPost(payload.datos, payload.caption);
    case "reel":
      return publishNewsVideoPost(payload.videoPublicId, payload.caption);
  }
}

/**
 * Valida un payload tal como vuelve de la base de datos o llega del navegador.
 * Se comprueba aunque venga de nuestra propia tabla: lo que se guardó pudo
 * escribirse con una versión anterior del código.
 */
export function leerPublicacionPayload(valor: unknown): PublicacionPayload | null {
  const p = valor as { tipo?: unknown } | null;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (p?.tipo === "articulo") {
    const dato = p as { url?: unknown; caption?: unknown; imagenPublicId?: unknown };
    if (!esUrlValida(dato.url as string)) return null;
    return {
      tipo: "articulo",
      url: dato.url as string,
      caption: texto(dato.caption) || undefined,
      imagenPublicId: texto(dato.imagenPublicId) || undefined,
    };
  }

  if (p?.tipo === "manual") {
    const d = (p as { datos?: NoticiaManual }).datos;
    const datos = {
      title: texto(d?.title),
      sourceHost: texto(d?.sourceHost),
      caption: texto(d?.caption),
      imagenPublicId: texto(d?.imagenPublicId),
    };
    if (!datos.title || !datos.sourceHost || !datos.caption || !datos.imagenPublicId) return null;
    return { tipo: "manual", datos };
  }

  if (p?.tipo === "carrusel") {
    const d = (p as { datos?: Partial<CarruselEntrada>; caption?: unknown }).datos;
    const caption = texto((p as { caption?: unknown }).caption);
    const title = texto(d?.title);
    const sourceHost = texto(d?.sourceHost);
    const principal = leerPrincipalCarrusel(d?.principal);
    const elementos = leerElementosCarrusel(d?.elementos);
    if (!caption || !title || !sourceHost || !principal || !elementos) return null;
    return { tipo: "carrusel", datos: { title, sourceHost, principal, elementos }, caption };
  }

  if (p?.tipo === "reel") {
    const d = p as { videoPublicId?: unknown; caption?: unknown };
    const videoPublicId = texto(d.videoPublicId);
    const caption = texto(d.caption);
    if (!videoPublicId || !caption) return null;
    return { tipo: "reel", videoPublicId, caption };
  }

  return null;
}

/**
 * Deja el post listo para publicarse más tarde sin depender de nadie más.
 *
 * `publishNewsPost` vuelve a scrapear el artículo en el momento de publicar,
 * que para el botón inmediato da igual pero para un post programado no: entre
 * que se programa y sale, el portal puede editar el titular, cambiar la foto o
 * caerse, y entonces lo publicado no sería lo que se vio en la vista previa.
 *
 * Así que aquí se resuelve todo por adelantado y la foto del artículo se copia
 * a Cloudinary. El resultado es siempre un payload autocontenido —`manual` o
 * `carrusel` con `public_id`s—, formas que el código ya sabe publicar.
 */
export async function materializarParaProgramar(
  payload: PublicacionPayload,
): Promise<PublicacionPayload> {
  if (payload.tipo === "articulo") {
    const article = await fetchArticle(payload.url);
    return {
      tipo: "manual",
      datos: {
        title: article.title,
        sourceHost: article.sourceHost,
        caption: payload.caption ?? buildNewsCaption(article),
        imagenPublicId: payload.imagenPublicId ?? (await subirDesdeUrl(article.imageUrl)),
      },
    };
  }

  if (payload.tipo === "carrusel" && payload.datos.principal.tipo === "articulo") {
    const article = await fetchArticle(payload.datos.principal.url);
    return {
      ...payload,
      datos: {
        ...payload.datos,
        principal: { tipo: "subida", publicId: await subirDesdeUrl(article.imageUrl) },
      },
    };
  }

  // `manual` y `reel` ya viven enteros en Cloudinary.
  return payload;
}
