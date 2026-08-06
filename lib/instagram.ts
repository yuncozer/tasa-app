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

interface GraphErrorBody {
  error?: { message: string; type: string; code: number; fbtrace_id: string };
}

export class InstagramApiError extends Error {
  constructor(message: string, graphError: GraphErrorBody) {
    super(`${message}: ${graphError.error?.message ?? "error desconocido"}`);
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

function esMediaNoLista(body: GraphErrorBody): boolean {
  return body.error?.code === MEDIA_NOT_READY_CODE;
}

async function publicarContenedor(containerId: string): Promise<string> {
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

/** Publica un post de una sola imagen: crea el contenedor y lo publica. */
export async function publishDailyPost(
  imageUrl: string,
  caption: string,
): Promise<{ mediaId: string }> {
  const containerId = await crearContenedor(
    { image_url: imageUrl, caption },
    "el contenedor de media",
  );
  const mediaId = await publicarContenedor(containerId);
  return { mediaId };
}

/**
 * Publica un carrusel: un contenedor hijo por imagen, un padre que los agrupa
 * con el caption, y a publicar el padre.
 *
 * Los hijos se crean en paralelo a propósito. Crear un contenedor es lo que
 * hace que Meta se descargue la imagen, y las nuestras se renderizan al
 * vuelo; en serie se sumarían los dos tiempos de render y descarga dentro de
 * una función que tiene tope de ejecución. `Promise.all` además conserva el
 * orden del arreglo, que es el orden en que se deslizan las diapositivas.
 */
export async function publishCarouselPost(
  imageUrls: string[],
  caption: string,
): Promise<{ mediaId: string }> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error("Un carrusel de Instagram lleva entre 2 y 10 imágenes");
  }

  const hijos = await Promise.all(
    imageUrls.map((imageUrl) =>
      crearContenedor(
        { image_url: imageUrl, is_carousel_item: "true" },
        "una diapositiva del carrusel",
      ),
    ),
  );

  const padre = await crearContenedor(
    { media_type: "CAROUSEL", children: hijos.join(","), caption },
    "el contenedor del carrusel",
  );

  const mediaId = await publicarContenedor(padre);
  return { mediaId };
}
