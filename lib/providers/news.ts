const TIMEOUT_MS = 12_000;

/**
 * Datos mínimos que hacen falta para armar un post de noticia: título,
 * imagen y el cuerpo del artículo (recortado). La plantilla de imagen solo
 * muestra un titular, pero el caption sí usa el texto completo del cuerpo
 * cuando el portal está en `CONTENEDOR_POR_HOST` — si no lo está, se
 * degrada a la descripción corta del `<meta>` en vez de romper.
 */
export interface ArticleData {
  title: string;
  imageUrl: string;
  description: string;
  /** Hostname de la URL que se pidió publicar, nunca `og:site_name`. */
  sourceHost: string;
  /** `article:published_time` del artículo (ISO 8601), o `null`. */
  publishedAt: string | null;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LaTasa/1.0)",
      Accept: "text/html",
    },
  });
  if (!response.ok) throw new Error(`El artículo respondió ${response.status}`);
  return response.text();
}

/**
 * Extrae `content` de un `<meta property="key" content="valor">` (o
 * `name="key"`). Ancla el orden `property/name` antes que `content` porque
 * es el orden que usan WordPress/Yoast/Jetpack en los portales observados;
 * si un portal nuevo lo invierte, esta regex no lo encuentra y hay que
 * ajustarla entonces, no antes.
 */
function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    "i",
  ).exec(html);
  return match ? match[1] : null;
}

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&hellip;": "…",
  "&amp;": "&",
  "&quot;": '"',
  "&#039;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&nbsp;|&hellip;|&amp;|&quot;|&#039;|&apos;/g, (m) => ENTIDADES[m] ?? m);
}

/** Recorta el sufijo `" - ${siteName}"` que algunos portales pegan al og:title. */
function stripSiteNameSuffix(title: string, siteName: string | null): string {
  if (!siteName) return title;
  const suffix = ` - ${siteName}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

/** Decodifica entidades, quita el marcador de truncado que deja WordPress en
 * los excerpts automáticos y colapsa espacios repetidos. */
function limpiarTexto(raw: string): string {
  return decodeEntities(raw)
    .replace(/\s*\[…\]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recorta a `maxLength` sin partir una oración a la mitad si se puede
 * evitar: busca el último `.`/`!`/`?` de cierre dentro de la ventana y corta
 * ahí. Si eso dejaría menos de la mitad del largo pedido (texto sin
 * puntuación clara), se cae a cortar por palabra. En ambos casos, si hubo
 * corte, se invita a leer el resto en la fuente.
 */
function cortarTexto(texto: string, sourceHost: string, maxLength: number): string {
  if (texto.length <= maxLength) return texto;

  const ventana = texto.slice(0, maxLength);
  const finales = [...ventana.matchAll(/[.!?](?=\s|$)/g)];
  const ultimo = finales.at(-1);

  const cortado =
    ultimo && ultimo.index !== undefined && ultimo.index > maxLength * 0.5
      ? ventana.slice(0, ultimo.index + 1).trim()
      : `${ventana.slice(0, ventana.lastIndexOf(" ")).trim()}…`;

  return `${cortado} Puedes ampliar el contenido en: ${sourceHost}`;
}

/** Largo del cuerpo en el caption: ~600-800 caracteres, punto medio. */
const LARGO_CUERPO = 700;
/** Largo de la descripción corta cuando no hay cuerpo scrapeado. */
const LARGO_DESCRIPCION = 300;
/**
 * Ventana de HTML donde buscar los `<p>` del cuerpo, a partir del inicio del
 * contenedor. No se busca el cierre exacto del div —tiene divs anidados,
 * mismo motivo que documenta `lib/providers/bcv.ts`— así que se toma un
 * tramo generoso en vez de intentar emparejar etiquetas.
 */
const VENTANA_CUERPO = 20_000;
/** Un párrafo más corto que esto suele ser ruido (firma, `&nbsp;` suelto), no contenido real. */
const LARGO_MINIMO_PARRAFO = 15;
/**
 * Bajo este largo, un párrafo sin puntuación de cierre es casi siempre una
 * firma o antetítulo suelto ("Humberto Contreras"), no una oración real —
 * las oraciones de verdad, aunque sean cortas, casi siempre terminan en
 * `.`/`!`/`?`/comillas.
 */
const LARGO_SIN_PUNTUACION = 60;

/**
 * Clase del contenedor del cuerpo del artículo, por hostname. A diferencia
 * de los meta tags (estándar en cualquier portal WordPress), esto sí es
 * específico de cada uno — se añade una entrada por portal a medida que se
 * agregan, no hay forma genérica de adivinarlo.
 */
const CONTENEDOR_POR_HOST: Record<string, string> = {
  "lapatilla.com": "entry-content",
  "bitlyanews.com": "content-inner",
  "lanacionweb.com": "textnota",
};

/**
 * Busca dónde empieza el contenedor por su clase, sin asumir que es la
 * primera de la lista: algunos temas (Bricks Builder, p. ej.) anteponen
 * clases propias del framework (`class="brxe-text textnota ..."`).
 */
function indiceContenedor(html: string, clase: string): number {
  const escaped = clase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`class="[^"]*\\b${escaped}\\b[^"]*"`).exec(html);
  return match?.index ?? -1;
}

/** Ruido conocido: vacío, firma del sitio, o una línea corta sin puntuación de cierre (antetítulo/firma de autor). */
function esRuido(parrafo: string, host: string): boolean {
  if (parrafo.length < LARGO_MINIMO_PARRAFO) return true;
  if (parrafo.toLowerCase() === host.toLowerCase()) return true;
  if (parrafo.length < LARGO_SIN_PUNTUACION && !/[.!?»":]$/.test(parrafo)) return true;
  return false;
}

/**
 * Extrae los `<p>` del cuerpo dentro de la ventana del contenedor, filtrando
 * el ruido ya visto en los portales de ejemplo: párrafos vacíos (`<p>&nbsp;</p>`),
 * la firma del sitio metida como párrafo (`<p><strong>lapatilla.com</strong></p>`)
 * y firmas de autor sueltas (`<p><strong>Humberto Contreras</strong></p>`). Los
 * anuncios y embeds (Aniview, Mailchimp, Instagram) quedan fuera solos: son
 * `<div>`/`<blockquote>` hermanos de los `<p>`, no contenido dentro de ellos.
 */
function extraerCuerpo(html: string, host: string): string {
  const clase = CONTENEDOR_POR_HOST[host];
  if (!clase) return "";

  const inicio = indiceContenedor(html, clase);
  if (inicio === -1) return "";

  const ventana = html.slice(inicio, inicio + VENTANA_CUERPO);
  const parrafos = [...ventana.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => limpiarTexto(match[1].replace(/<[^>]+>/g, "")))
    .filter((parrafo) => !esRuido(parrafo, host));

  return parrafos.join("\n\n");
}

/** Descarga y extrae los datos mínimos de un artículo de noticias. */
export async function fetchArticle(url: string): Promise<ArticleData> {
  const html = await fetchHtml(url);

  const siteName = metaContent(html, "og:site_name");
  const ogTitle = metaContent(html, "og:title");
  const imageUrl = metaContent(html, "og:image");

  if (!ogTitle) throw new Error("No se encontró og:title en el artículo");
  if (!imageUrl) throw new Error("No se encontró og:image en el artículo");

  const sourceHost = new URL(url).hostname.replace(/^www\./, "");

  const cuerpo = extraerCuerpo(html, sourceHost);
  const description = cuerpo
    ? cortarTexto(cuerpo, sourceHost, LARGO_CUERPO)
    : cortarTexto(
        limpiarTexto(metaContent(html, "description") || metaContent(html, "og:description") || ""),
        sourceHost,
        LARGO_DESCRIPCION,
      );

  return {
    title: decodeEntities(stripSiteNameSuffix(ogTitle, siteName)),
    imageUrl,
    description,
    sourceHost,
    publishedAt: metaContent(html, "article:published_time"),
  };
}
