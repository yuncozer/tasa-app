/**
 * Publicación en Instagram vía "Instagram API with Instagram Login" (login
 * directo por instagram.com, sin pasar por una Página de Facebook — es el
 * flujo que se configuró para esta cuenta, con testers en el App Dashboard).
 *
 * Esta variante usa `graph.instagram.com`, no `graph.facebook.com`: son
 * bases distintas y un token de este flujo (empieza con "IGAA") no lo
 * reconoce la Graph API clásica de Facebook. Si en el futuro se cambia a
 * login por Página de Facebook, el token empezaría con "EAA" y esta base
 * habría que volver a `graph.facebook.com`.
 *
 * El flujo son dos pasos: crear un contenedor de media con la URL de la
 * imagen y el caption, y publicarlo. Meta procesa el contenedor de forma
 * asíncrona antes de poder publicarlo, así que `media_publish` puede
 * responder que todavía no está listo (código 9007) justo después de
 * crearlo; por eso se reintenta unas pocas veces con una espera corta antes
 * de darlo por fallido.
 *
 * El carrusel añade un nivel: cada imagen es un contenedor "hijo"
 * (`is_carousel_item`), y sobre ellos se crea un contenedor "padre"
 * (`media_type=CAROUSEL`) que es el que lleva el caption y el que se publica.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
const MEDIA_NOT_READY_CODE = 9007;
const REINTENTOS = 3;
const ESPERA_MS = 4000;
const POLL_INTERVALO_MS = 5000;
const POLL_MAX_INTENTOS = 36; // ~3 minutos: el procesamiento de video es más lento que el de imagen

interface GraphErrorBody {
  error?: { message: string; type: string; code: number; fbtrace_id: string };
}

export class InstagramApiError extends Error {
  constructor(message: string, graphError: GraphErrorBody) {
    // El código va en el mensaje porque este texto es lo único que ve el admin
    // desde el teléfono: sin él, dos fallos muy distintos de Meta se leen igual
    // y no hay forma de saber si conviene reintentar o no.
    const codigo = graphError.error?.code;
    super(
      `${message}: ${graphError.error?.message ?? "error desconocido"}${codigo ? ` (código ${codigo})` : ""}`,
    );
  }
}

function credenciales(): { accountId: string; accessToken: string } {
  const accountId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.IG_ACCESS_TOKEN;
  if (!accountId || !accessToken) {
    throw new Error("Faltan IG_BUSINESS_ACCOUNT_ID o IG_ACCESS_TOKEN");
  }
  return { accountId, accessToken };
}

async function crearContenedor(params: Record<string, string>, queHace: string): Promise<string> {
  const { accountId, accessToken } = credenciales();
  const url = new URL(`${GRAPH_BASE}/${accountId}/media`);
  for (const [clave, valor] of Object.entries(params)) url.searchParams.set(clave, valor);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new InstagramApiError(`No se pudo crear ${queHace}`, body);
  return body.id as string;
}

/**
 * Un solo sondeo del estado de un contenedor, sin esperas.
 *
 * Es el paso intermedio que documenta Meta —crear, sondear `status_code` hasta
 * `FINISHED`, publicar— y saltárselo es exactamente lo que devuelve el error
 * 9007 ("Media ID is not available"). El reintento corto de
 * `publicarContenedor` alcanza para una imagen suelta, pero no para un video
 * ni para el padre de un carrusel que lleva uno.
 *
 * Va suelta, sin el bucle, porque la cola de programadas sondea **una vez por
 * disparo del cron** y guarda el avance en la fila: un bucle que espera
 * minutos no cabe en el tope de una función serverless, que es exactamente lo
 * que dejó una publicación colgada en `publicando`.
 */
export type EstadoContenedor = "listo" | "procesando";

export async function estadoContenedor(containerId: string, queEs: string): Promise<EstadoContenedor> {
  const { accessToken } = credenciales();
  const url = new URL(`${GRAPH_BASE}/${containerId}`);
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new InstagramApiError(`No se pudo consultar el estado de ${queEs}`, body);

  // Si Meta no sirve el campo, se sigue adelante en vez de esperar en balde:
  // queda el reintento ante el 9007, que es como funcionaba antes de existir
  // este sondeo. Esperar los tres minutos completos para acabar fallando
  // sería peor que intentar publicar.
  if (body.status_code === undefined) return "listo";
  if (body.status_code === "FINISHED" || body.status_code === "PUBLISHED") return "listo";
  if (body.status_code === "ERROR") throw new Error(`Instagram no pudo procesar ${queEs}`);
  if (body.status_code === "EXPIRED") throw new Error(`El contenedor de ${queEs} caducó sin publicarse`);
  return "procesando";
}

/**
 * La URL pública del post ya publicado (`instagram.com/p/…`).
 *
 * Se consulta después de publicar porque `media_publish` solo devuelve el id
 * del media, que no sirve para compartir. Con ella el cron de tasas puede
 * anotar a dónde apunta `/hoy` sin que nadie copie nada a mano.
 */
export async function permalinkDeMedia(mediaId: string): Promise<string> {
  const { accessToken } = credenciales();
  const url = new URL(`${GRAPH_BASE}/${mediaId}`);
  url.searchParams.set("fields", "permalink");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new InstagramApiError("No se pudo consultar el enlace del post", body);
  if (!body.permalink) throw new Error("Instagram no devolvió el enlace del post");
  return body.permalink as string;
}

/**
 * Espera a que Meta termine de procesar un contenedor, sondeando en bucle.
 *
 * La usan los caminos que publican de un tirón dentro de una sola petición
 * (el post diario y el botón inmediato de `/admin`). La cola de programadas
 * **no** la usa: ahí cada disparo sondea una vez con `estadoContenedor()` y
 * deja constancia de por dónde iba.
 */
async function esperarContenedorListo(containerId: string, queEs: string): Promise<void> {
  for (let intento = 1; intento <= POLL_MAX_INTENTOS; intento++) {
    if ((await estadoContenedor(containerId, queEs)) === "listo") return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVALO_MS));
  }

  throw new Error(`Instagram no terminó de procesar ${queEs} a tiempo`);
}

function esMediaNoLista(body: GraphErrorBody): boolean {
  return body.error?.code === MEDIA_NOT_READY_CODE;
}

export async function publicarContenedor(containerId: string): Promise<string> {
  const { accountId, accessToken } = credenciales();
  const url = new URL(`${GRAPH_BASE}/${accountId}/media_publish`);
  url.searchParams.set("creation_id", containerId);
  url.searchParams.set("access_token", accessToken);

  for (let intento = 1; intento <= REINTENTOS; intento++) {
    const res = await fetch(url, { method: "POST" });
    const body = await res.json();
    if (res.ok) return body.id as string;

    if (esMediaNoLista(body) && intento < REINTENTOS) {
      await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
      continue;
    }

    throw new InstagramApiError("No se pudo publicar el contenedor", body);
  }

  throw new Error("No se pudo publicar el contenedor tras varios reintentos");
}

/**
 * Contenedores por tipo de post. Se exportan sueltos porque la cola de
 * programadas los llama por separado —crear en un disparo, sondear en el
 * siguiente— mientras que las funciones de más abajo los encadenan de un
 * tirón para quien publica con el navegador esperando.
 */
export function crearContenedorImagen(imageUrl: string, caption: string): Promise<string> {
  return crearContenedor({ image_url: imageUrl, caption }, "el contenedor de media");
}

export function crearContenedorReel(videoUrl: string, caption: string): Promise<string> {
  return crearContenedor(
    { media_type: "REELS", video_url: videoUrl, caption },
    "el contenedor del Reel",
  );
}

/** Publica un post de una sola imagen: crea el contenedor y lo publica. */
export async function publishDailyPost(
  imageUrl: string,
  caption: string,
): Promise<{ mediaId: string }> {
  const containerId = await crearContenedorImagen(imageUrl, caption);
  const mediaId = await publicarContenedor(containerId);
  return { mediaId };
}

/**
 * Publica un video como Reel: mismo contenedor que la imagen, pero con
 * `media_type=REELS` y `video_url` en vez de `image_url`, y con una espera
 * de procesamiento (`esperarVideoListo`) antes del intento de publicar —
 * el reintento corto de `publicarContenedor` no alcanza para video.
 */
export async function publishReel(videoUrl: string, caption: string): Promise<{ mediaId: string }> {
  const containerId = await crearContenedorReel(videoUrl, caption);
  await esperarContenedorListo(containerId, "el Reel");
  const mediaId = await publicarContenedor(containerId);
  return { mediaId };
}

export type ElementoCarrusel = { tipo: "imagen" | "video"; url: string };

/** Tope de Meta para un carrusel; más elementos y rechaza el contenedor padre. */
export const MAX_ELEMENTOS_CARRUSEL = 10;

/**
 * Publica un carrusel: un contenedor hijo por elemento, un padre que los
 * agrupa con el caption, y a publicar el padre. Lo usan tanto el post diario
 * de tasas (dos imágenes) como el de noticias, que además puede llevar video.
 *
 * Los hijos se crean en paralelo a propósito. Crear un contenedor es lo que
 * hace que Meta se descargue la imagen, y las nuestras se renderizan al
 * vuelo; en serie se sumarían los dos tiempos de render y descarga dentro de
 * una función que tiene tope de ejecución. `Promise.all` además conserva el
 * orden del arreglo, que es el orden en que se deslizan las diapositivas —y
 * el primero fija la relación de aspecto de todo el post.
 *
 * La espera de los videos va **después** de crearlos todos, no intercalada:
 * así los procesa Meta a la vez en vez de encadenar un polling tras otro.
 * Los videos van como `media_type=VIDEO`, **no** `REELS`: Meta excluye los
 * Reels de los carruseles, y por eso un video publicado por aquí no aparece
 * en la pestaña de Reels — para eso está `publishReel`.
 */
export function crearHijosCarrusel(elementos: ElementoCarrusel[]): Promise<string[]> {
  if (elementos.length < 2 || elementos.length > MAX_ELEMENTOS_CARRUSEL) {
    throw new Error(`Un carrusel de Instagram lleva entre 2 y ${MAX_ELEMENTOS_CARRUSEL} elementos`);
  }

  return Promise.all(
    elementos.map((elemento) =>
      crearContenedor(
        elemento.tipo === "video"
          ? { is_carousel_item: "true", media_type: "VIDEO", video_url: elemento.url }
          : { is_carousel_item: "true", image_url: elemento.url },
        "una diapositiva del carrusel",
      ),
    ),
  );
}

export function crearPadreCarrusel(hijos: string[], caption: string): Promise<string> {
  return crearContenedor(
    { media_type: "CAROUSEL", children: hijos.join(","), caption },
    "el contenedor del carrusel",
  );
}

export async function publishCarousel(
  elementos: ElementoCarrusel[],
  caption: string,
): Promise<{ mediaId: string }> {
  const hijos = await crearHijosCarrusel(elementos);

  // Si el padre se arma antes de que Meta termine de procesar un video, lo rechaza.
  await Promise.all(
    hijos
      .filter((_, i) => elementos[i].tipo === "video")
      .map((id) => esperarContenedorListo(id, "un video del carrusel")),
  );

  const padre = await crearPadreCarrusel(hijos, caption);

  // El padre también se procesa, y con un video dentro tarda bastante más que
  // los pocos segundos que cubre el reintento de `publicarContenedor`. Sin esta
  // espera, publicar un carrusel con video fallaba con el 9007 de Meta ("Media
  // ID is not available") mientras el de solo imágenes pasaba de milagro,
  // porque su padre está listo casi al instante.
  await esperarContenedorListo(padre, "el carrusel");

  const mediaId = await publicarContenedor(padre);
  return { mediaId };
}

/**
 * Atajo para el post diario, que siempre son imágenes. Existe para no obligar
 * a `app/api/cron/publish-instagram` a envolver cada URL en un objeto.
 */
export async function publishCarouselPost(
  imageUrls: string[],
  caption: string,
): Promise<{ mediaId: string }> {
  return publishCarousel(
    imageUrls.map((url) => ({ tipo: "imagen" as const, url })),
    caption,
  );
}
