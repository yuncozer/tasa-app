import { buildNewsCaption } from "@/lib/caption";
import type { ElementoCarrusel } from "@/lib/instagram";
import { publishCarousel, publishDailyPost, publishReel } from "@/lib/instagram";
import { signNewsImageParams } from "@/lib/news-signature";
import { recortarTitulo } from "@/lib/og-cintillo";
import type { FormatoVideo, MarcaVideo } from "@/lib/providers/cloudinary";
import {
  limpiarFuente,
  subirDesdeUrl,
  urlDescargaVideo,
  urlImagen,
  urlVideoConMarca,
} from "@/lib/providers/cloudinary";
import type { ArticleData } from "@/lib/providers/news";
import { fetchArticle } from "@/lib/providers/news";
import { esUrlValida } from "@/lib/validar-url";

/** Proporción del post/carrusel: la elige el usuario solo cuando el primer elemento es un video. */
export type ProporcionCarrusel = "1:1" | "4:5";

/**
 * Arma la URL firmada de `instagram-post-news`. El título es opcional: las
 * diapositivas secundarias de un carrusel no lo llevan (ni la fecha), porque
 * repetirlo en cada una no aporta nada y le quita sitio a la foto.
 *
 * `proporcion` siempre viaja en el conjunto firmado (con `"1:1"` por
 * defecto): no hay URLs firmadas persistidas en ningún sitio, así que
 * agregar esta clave no rompe compatibilidad con nada ya generado.
 */
function armarUrlImagenFirmada(params: {
  title?: string;
  image: string;
  source: string;
  proporcion?: ProporcionCarrusel;
}): string {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("Falta configurar SITE_URL");

  const proporcion = params.proporcion ?? "1:1";
  // Sin título, la clave se omite del todo en vez de ir vacía: la ruta firma
  // exactamente los parámetros que recibe, y un `title=` de más no cuadraría.
  const firmados: Record<string, string> = params.title
    ? { title: params.title, image: params.image, source: params.source, proporcion }
    : { image: params.image, source: params.source, proporcion };

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
 * Video propio con la marca superpuesta, publicado como Reel: va solo y en
 * 9:16, que es lo único que entra en la pestaña de Reels. Para acompañarlo de
 * imágenes en un mismo post está el carrusel de más abajo, donde el mismo
 * video se reencuadra y deja de ser un Reel.
 */
export async function previewNewsVideoPost(
  videoPublicId: string,
  marca: MarcaVideo = {},
): Promise<{ videoUrl: string; descargaUrl: string; conCintillo: boolean }> {
  // En serie y no con `Promise.all`: las dos componen el mismo cintillo, así
  // que en paralelo lo generaban y lo subían dos veces a la vez. La segunda
  // llamada reutiliza el PNG que dejó lista la primera.
  const videoUrl = await urlVideoConMarca(videoPublicId, "reel", marca);
  const descargaUrl = await urlDescargaVideo(videoPublicId, "reel", marca);

  // Se declara además de las URLs porque desde el navegador no hay forma de
  // saber si la marca llegó a aplicarse: si la capa falta, Cloudinary sirve el
  // video sin ella y sin error, y el admin publicaría creyendo que la lleva.
  return { videoUrl, descargaUrl, conCintillo: videoUrl.includes("l_cintillo_") };
}

export async function publishNewsVideoPost(
  videoPublicId: string,
  caption: string,
  marca: MarcaVideo = {},
): Promise<{ mediaId: string }> {
  const { videoUrl } = await previewNewsVideoPost(videoPublicId, marca);
  return publishReel(videoUrl, caption);
}

/**
 * Elementos que el usuario compone en `/admin/noticia` para un carrusel, en
 * el orden en que los ordenó. Las imágenes se identifican por su `public_id`
 * de Cloudinary y se envuelven en la plantilla de marca; el video se
 * reencuadra al formato del carrusel.
 *
 * El video lleva su propia `MarcaVideo`: el cintillo se decide **por clip**,
 * no para todo el post, y su crédito es suyo y no el `sourceHost` del post —
 * un clip prestado no tiene por qué venir del mismo portal que la noticia que
 * acompaña.
 */
export type ElementoCarruselEntrada =
  | { tipo: "imagen"; publicId: string }
  | ({ tipo: "video"; publicId: string } & MarcaVideo);

/**
 * De dónde sale el elemento principal del carrusel. Se resuelve en el
 * servidor y no se acepta una URL suelta del navegador: así el material que
 * se enmarca sigue viniendo del artículo real o de Cloudinary, igual que en
 * el post de una sola imagen.
 *
 * `video` solo lo produce el modo "Noticia propia". No usa el `title` del
 * marco —ese lo compone la plantilla de imagen, y aquí no hay imagen que
 * enmarcar—, pero sí puede llevar titular propio en su cintillo, que es la
 * única forma de titular un video. Es también lo que obliga a elegir
 * proporción 1:1 o 4:5 en vez de asumir siempre 1:1.
 */
export type PrincipalCarrusel =
  | { tipo: "articulo"; url: string }
  | { tipo: "subida"; publicId: string }
  | ({ tipo: "video"; publicId: string } & MarcaVideo);

export interface CarruselEntrada {
  /** Fuente del marco de marca, común a todas las imágenes (incluida la principal, si es imagen). */
  sourceHost: string;
  /** Título del marco: solo se usa (y solo se pide) cuando el principal es una imagen. */
  title?: string;
  /**
   * Elemento que va siempre de primero: es el que da identidad al post y,
   * por cómo funciona Instagram, el que fija el formato de todo el carrusel.
   */
  principal: PrincipalCarrusel;
  /** Lo que el usuario añadió después, en el orden en que lo ordenó. */
  elementos: ElementoCarruselEntrada[];
  /**
   * Proporción de todo el carrusel. Solo importa cuando el principal es un
   * video (con imagen, siempre es `"1:1"`, el único formato que usa la
   * plantilla de marco). Por defecto `"1:1"` para no romper filas ya
   * programadas que no la traían.
   */
  proporcion?: ProporcionCarrusel;
}

/** Valida el origen del elemento principal tal como llega del navegador. */
export function leerPrincipalCarrusel(valor: unknown): PrincipalCarrusel | null {
  const item = valor as { tipo?: unknown; url?: unknown; publicId?: unknown; fuente?: unknown } | null;
  if (item?.tipo === "articulo" && esUrlValida(item.url as string)) {
    return { tipo: "articulo", url: item.url as string };
  }
  if (item?.tipo === "subida" && typeof item.publicId === "string" && item.publicId) {
    return { tipo: "subida", publicId: item.publicId };
  }
  if (item?.tipo === "video" && typeof item.publicId === "string" && item.publicId) {
    return { tipo: "video", publicId: item.publicId, ...leerMarcaVideo(item) };
  }
  return null;
}

/** Valida la proporción tal como llega del navegador o de la base de datos. */
export function leerProporcionCarrusel(valor: unknown): ProporcionCarrusel {
  return valor === "4:5" ? "4:5" : "1:1";
}

/** Tope de la ventana del cintillo: más allá dura de hecho todo el clip. */
const MAX_SEGUNDOS_CINTILLO = 60;

/**
 * Valida el cintillo de un video tal como llega del navegador o de la cola.
 *
 * Los tres campos son opcionales, y tienen que serlo: en la cola hay posts
 * programados antes de que el cintillo existiera, cuyo payload solo trae
 * `fuente`. Sin título ni fuente el video sale solo con el sello, que es
 * exactamente como salía entonces.
 */
export function leerMarcaVideo(valor: unknown): MarcaVideo {
  const item = valor as { titulo?: unknown; fuente?: unknown; segundos?: unknown } | null;

  const titulo = typeof item?.titulo === "string" ? recortarTitulo(item.titulo) : "";
  const segundos =
    typeof item?.segundos === "number" && Number.isFinite(item.segundos) && item.segundos > 0
      ? Math.min(Math.round(item.segundos), MAX_SEGUNDOS_CINTILLO)
      : undefined;

  return { titulo: titulo || undefined, fuente: limpiarFuente(item?.fuente), segundos };
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
    // La marca se copia a mano porque este lector reconstruye el objeto: lo que
    // no se nombre aquí desaparece al programar el post.
    elementos.push(tipo === "video" ? { tipo, publicId, ...leerMarcaVideo(item) } : { tipo, publicId });
  }
  return elementos;
}

/** Formato de video de Cloudinary que corresponde a cada proporción de carrusel. */
function formatoDeProporcion(proporcion: ProporcionCarrusel): FormatoVideo {
  return proporcion === "4:5" ? "carrusel-4-5" : "carrusel";
}

/**
 * Arma las URLs finales del carrusel. Cada imagen pasa por la misma plantilla
 * firmada (`instagram-post-news`) que la imagen principal de una noticia:
 * nunca se publica una imagen cruda del usuario sin el marco de La Tasa.
 */
async function buildCarousel(datos: CarruselEntrada): Promise<ElementoCarrusel[]> {
  const proporcion = datos.proporcion ?? "1:1";
  const formato = formatoDeProporcion(proporcion);

  /** Sin `title`, el marco sale sin titular ni fecha: es la variante secundaria. */
  const enmarcar = (image: string, title?: string) =>
    armarUrlImagenFirmada({ title, image, source: datos.sourceHost, proporcion });

  const extras = await Promise.all(
    datos.elementos.map(async (elemento): Promise<ElementoCarrusel> => {
      if (elemento.tipo === "video") {
        return { tipo: "video", url: await urlVideoConMarca(elemento.publicId, formato, elemento) };
      }
      return { tipo: "imagen", url: enmarcar(urlImagen(elemento.publicId)) };
    }),
  );

  if (datos.principal.tipo === "video") {
    const principal: ElementoCarrusel = {
      tipo: "video",
      url: await urlVideoConMarca(datos.principal.publicId, formato, datos.principal),
    };
    return [principal, ...extras];
  }

  const imagenPrincipal =
    datos.principal.tipo === "subida"
      ? urlImagen(datos.principal.publicId)
      : (await fetchArticle(datos.principal.url)).imageUrl;

  return [{ tipo: "imagen", url: enmarcar(imagenPrincipal, datos.title) }, ...extras];
}

/** Vista previa del carrusel: las URLs reales que se publicarían, sin publicar. */
/**
 * Una diapositiva tal como la muestra `/admin/noticia`: además de la URL que
 * se publicaría, la que el navegador **guarda** en vez de abrir.
 *
 * La descarga se resuelve en el servidor y no concatenando en el cliente
 * porque las dos mitades no se piden igual: la imagen es nuestra y le basta
 * una cabecera, mientras que el video lo sirve Cloudinary y necesita
 * `fl_attachment` dentro de la propia transformación.
 */
export interface DiapositivaPrevia extends ElementoCarrusel {
  descargaUrl: string;
}

export async function previewCarouselPost(datos: CarruselEntrada): Promise<{ elementos: DiapositivaPrevia[] }> {
  const elementos = await buildCarousel(datos);
  const formato = formatoDeProporcion(datos.proporcion ?? "1:1");

  // Mismo orden que arma `buildCarousel`: el principal primero, luego los
  // extras. Es lo que permite recuperar de qué `publicId` salió cada video.
  const origenes: Array<PrincipalCarrusel | ElementoCarruselEntrada> = [datos.principal, ...datos.elementos];

  return {
    elementos: await Promise.all(
      elementos.map(async (elemento, indice): Promise<DiapositivaPrevia> => {
        const origen = origenes[indice];
        if (elemento.tipo === "video" && origen?.tipo === "video") {
          return { ...elemento, descargaUrl: await urlDescargaVideo(origen.publicId, formato, origen) };
        }
        return { ...elemento, descargaUrl: urlDescargaImagen(elemento.url) };
      }),
    ),
  };
}

/**
 * La misma imagen de la plantilla, pero que el navegador guarda. El parámetro
 * queda fuera del conjunto firmado (la ruta reconstruye la firma leyendo
 * claves conocidas por nombre), así que no invalida nada.
 */
export function urlDescargaImagen(url: string): string {
  return `${url}&descargar=1`;
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
  | ({ tipo: "reel"; videoPublicId: string; caption: string } & MarcaVideo);

/**
 * Cuánto del título se guarda para la cola. No es el ancho de la pantalla —de
 * recortar lo que no quepa ya se encarga el CSS—, sino el tope de lo que viaja
 * al navegador: lo justo para distinguir dos posts, sin arrastrar el titular
 * entero ni el caption a una lista que solo sirve para identificarlos.
 */
const LARGO_RESUMEN = 60;

/** Primera línea no vacía de un caption, donde va el titular en las plantillas del proyecto. */
function primeraLinea(caption: string): string {
  return caption.split("\n").find((linea) => linea.trim()) ?? "";
}

/**
 * Con qué nombre aparece una publicación en la cola.
 *
 * Sin esto, dos posts programados con pocos minutos de diferencia se ven
 * exactamente igual —solo su hora— y no hay forma de saber cuál se está
 * cancelando o reprogramando.
 *
 * El `reel` no tiene título: es lo único que se identifica por su caption, del
 * que se toma la primera línea. Un `carrusel` con principal de video tampoco
 * lo tiene —mismo motivo—, así que cae al mismo recurso. El `articulo` no
 * debería llegar aquí —`materializarParaProgramar` lo convierte en `manual`
 * al programarlo— pero se contempla igual, con su URL, para que un payload
 * viejo en la cola no salga sin nombre.
 */
export function resumenPublicacion(payload: PublicacionPayload): string {
  const bruto =
    payload.tipo === "manual"
      ? payload.datos.title
      : payload.tipo === "carrusel"
        ? (payload.datos.title ?? primeraLinea(payload.caption))
        : payload.tipo === "reel"
          ? primeraLinea(payload.caption)
          : (payload.caption ?? payload.url);

  const limpio = bruto.replace(/\s+/g, " ").trim();
  if (!limpio) return "Sin título";
  return limpio.length > LARGO_RESUMEN ? `${limpio.slice(0, LARGO_RESUMEN).trimEnd()}…` : limpio;
}

/**
 * Lo que se le va a entregar a Meta, ya resuelto: URLs definitivas y caption.
 * Es todo el trabajo previo a hablar con Instagram —scrapear, firmar la
 * imagen, componer la marca del video— y va aparte porque la cola de
 * programadas necesita hacerlo en un disparo y publicar en otro.
 */
export type PublicacionPreparada =
  | { tipo: "imagen"; imageUrl: string; caption: string }
  | { tipo: "reel"; videoUrl: string; caption: string }
  | { tipo: "carrusel"; elementos: ElementoCarrusel[]; caption: string };

/** Resuelve el payload a URLs, sin tocar la API de Instagram. */
export async function prepararPublicacion(payload: PublicacionPayload): Promise<PublicacionPreparada> {
  switch (payload.tipo) {
    case "articulo": {
      const { imageUrl, caption } = await buildNewsPost(payload.url, payload.imagenPublicId);
      return { tipo: "imagen", imageUrl, caption: payload.caption ?? caption };
    }
    case "manual":
      return { tipo: "imagen", ...previewManualNewsPost(payload.datos), caption: payload.datos.caption };
    case "carrusel":
      return { tipo: "carrusel", elementos: await buildCarousel(payload.datos), caption: payload.caption };
    case "reel": {
      const { videoUrl } = await previewNewsVideoPost(payload.videoPublicId, payload);
      return { tipo: "reel", videoUrl, caption: payload.caption };
    }
  }
}

/**
 * Única puerta de publicación de un tirón: la usan las rutas inmediatas, que
 * publican con el navegador esperando. La cola de programadas comparte
 * `prepararPublicacion()` pero reparte el resto entre varios disparos del
 * cron, porque un carrusel con video no cabe en el tope de una función.
 */
export async function ejecutarPublicacion(payload: PublicacionPayload): Promise<{ mediaId: string }> {
  const preparada = await prepararPublicacion(payload);
  switch (preparada.tipo) {
    case "imagen":
      return publishDailyPost(preparada.imageUrl, preparada.caption);
    case "reel":
      return publishReel(preparada.videoUrl, preparada.caption);
    case "carrusel":
      return publishCarousel(preparada.elementos, preparada.caption);
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
    const proporcion = leerProporcionCarrusel(d?.proporcion);
    // El título solo hace falta cuando el principal es una imagen: un video
    // principal no lo imprime en ningún sitio.
    if (!caption || !sourceHost || !principal || !elementos) return null;
    if (principal.tipo !== "video" && !title) return null;
    return {
      tipo: "carrusel",
      datos: { title: title || undefined, sourceHost, principal, elementos, proporcion },
      caption,
    };
  }

  if (p?.tipo === "reel") {
    const d = p as { videoPublicId?: unknown; caption?: unknown };
    const videoPublicId = texto(d.videoPublicId);
    const caption = texto(d.caption);
    if (!videoPublicId || !caption) return null;
    // La marca va opcional a propósito: las filas programadas antes de que
    // existieran el crédito y el cintillo no los traen y tienen que seguir
    // publicándose igual.
    return { tipo: "reel", videoPublicId, caption, ...leerMarcaVideo(p) };
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
  await calentarVideo(payload);

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

/**
 * Pide una vez el video con marca para que Cloudinary genere el derivado
 * **al programar** y no cuando Meta lo pida.
 *
 * La marca es una transformación por URL: la primera petición transcodifica el
 * clip entero y puede tardar bastante. Si esa espera cae dentro de la
 * publicación, se le suma al procesamiento de Meta y es tiempo que la cola no
 * tiene. Aquí, en cambio, la paga el momento de programar, donde no hay prisa.
 *
 * Se descarta el resultado y se ignora el fallo a propósito: es una
 * optimización, no un requisito, y no debe impedir que se programe el post.
 */
async function calentarVideo(payload: PublicacionPayload): Promise<void> {
  const videos: Promise<string>[] =
    payload.tipo === "reel"
      ? [urlVideoConMarca(payload.videoPublicId, "reel", payload)]
      : payload.tipo === "carrusel"
        ? (() => {
            const formato: FormatoVideo = formatoDeProporcion(payload.datos.proporcion ?? "1:1");
            const principal =
              payload.datos.principal.tipo === "video"
                ? [urlVideoConMarca(payload.datos.principal.publicId, formato, payload.datos.principal)]
                : [];
            const extras = payload.datos.elementos
              .filter((e) => e.tipo === "video")
              .map((e) => urlVideoConMarca(e.publicId, formato, e));
            return [...principal, ...extras];
          })()
        : [];

  await Promise.allSettled(
    videos.map(async (promesa) => {
      const url = await promesa;
      await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(45_000) });
    }),
  );
}
