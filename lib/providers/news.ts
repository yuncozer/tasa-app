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
  // El valor se cierra con la misma comilla con la que abrió: un titular con
  // apóstrofo recto (`content="El 'acuerdo' de…"`) se cortaba a la mitad
  // cuando el cierre era `["']` a secas.
  const match = new RegExp(
    `<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=(["'])([\\s\\S]*?)\\1`,
    "i",
  ).exec(html);
  return match ? match[2] : null;
}

/**
 * Nombres de las entidades del bloque Latin-1, en orden de punto de código
 * (160 = `&nbsp;` … 255 = `&yuml;`). Van como lista y se mapean por posición
 * en vez de escribirse como 96 pares a mano: el estándar las define
 * consecutivas, así que la lista *es* la tabla.
 */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr " +
  "deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest " +
  "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml " +
  "ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig " +
  "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml " +
  "eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";

/**
 * Entidades nombradas que se reconocen. Antes eran seis escritas a mano y
 * cualquier otra llegaba cruda al post: así se publicó un titular con
 * `&raquo;` a la vista, y otro con `&ntilde;` en mitad de una palabra. El
 * bloque Latin-1 cubre todas las letras acentuadas del español; encima van
 * las básicas y el puñado de signos tipográficos que sí usan los portales.
 */
const ENTIDADES: Record<string, string> = {
  ...Object.fromEntries(LATIN1.split(" ").map((nombre, i) => [nombre, String.fromCodePoint(160 + i)])),
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  euro: "€",
  trade: "™",
  // El espacio duro se normaliza a uno normal, como hacía el mapa anterior:
  // en un titular no aporta nada y complica los recortes posteriores.
  nbsp: " ",
};

const ENTIDAD = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g;

/** Descarta puntos de código que no representan un carácter utilizable. */
function puntoDeCodigo(codigo: number): string | null {
  if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return null;
  if (codigo >= 0xd800 && codigo <= 0xdfff) return null; // Surrogates sueltos.
  return String.fromCodePoint(codigo);
}

/**
 * Decodifica entidades nombradas y numéricas (decimales y hexadecimales) en
 * **una sola pasada**: encadenar dos convertiría `&amp;lt;` en `<`, que no es
 * lo que el portal escribió. Lo que no se reconoce se deja tal cual.
 */
function decodeEntities(text: string): string {
  return text.replace(ENTIDAD, (crudo, dec, hex, nombre) => {
    if (dec !== undefined) return puntoDeCodigo(Number.parseInt(dec, 10)) ?? crudo;
    if (hex !== undefined) return puntoDeCodigo(Number.parseInt(hex, 16)) ?? crudo;
    return ENTIDADES[nombre] ?? crudo;
  });
}

/**
 * Deshace el doble encodado de los portales que sirven UTF-8 declarándolo
 * Latin-1: llega `corresponsalÃ­a` en vez de `corresponsalía` (visto en el
 * `og:description` de identidadcorrentina.com.ar, cuyo cuerpo sí viene bien).
 * La firma es una `Ã`/`Â` seguida de un byte de continuación.
 *
 * Dos guardas evitan estropear texto sano: si aparece algún carácter fuera de
 * Latin-1 el texto ya está bien decodificado —reinterpretarlo lo truncaría a
 * su byte bajo—, y si la reinterpretación produce `�` es que no era
 * mojibake y se devuelve el original.
 */
function repararMojibake(texto: string): string {
  if (!/[\u00c3\u00c2][\u0080-\u00bf]/.test(texto)) return texto;
  if (/[^\u0000-\u00ff]/.test(texto)) return texto;
  const reparado = Buffer.from(texto, "latin1").toString("utf8");
  return reparado.includes("\ufffd") ? texto : reparado;
}

/**
 * Separadores con los que los portales pegan su nombre al titular. `-` y `:`
 * exigen espacio para no partir `Colombia-Venezuela` ni una hora.
 */
const SEPARADOR = /\s*[»«|–—·]\s*|\s*:\s+|\s+-\s+/g;

/** Minúsculas, sin acentos ni puntuación: así `Identidad Correntina` casa con `identidadcorrentina.com.ar`. */
function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Quita el nombre del portal del titular, vaya de prefijo o de sufijo. Antes
 * solo se contemplaba el sufijo `" - ${siteName}"`, y un portal que lo pone
 * delante (`Identidad Correntina » Colombia y Venezuela…`) publicaba el
 * titular con su marca encima del nuestro.
 *
 * El recorte solo ocurre si el fragmento **coincide** con el nombre del sitio
 * o con su hostname, comparando normalizado — el `og:site_name` de ese portal
 * es `Identidad Correntina » www.identidadcorrentina.com.ar`, así que también
 * se prueban sus trozos por separado. Sin esa condición, cortar por el primer
 * separador se comería titulares legítimos (`Alerta: sube el dólar`).
 */
function quitarNombreDelSitio(title: string, siteName: string | null, sourceHost: string): string {
  const nombres = new Set(
    [siteName ?? "", ...(siteName ?? "").split(SEPARADOR), sourceHost, sourceHost.replace(/\.[a-z.]+$/i, "")]
      .map(normalizarNombre)
      .filter(Boolean),
  );

  // En bucle porque los portales encadenan varios: bitlyanews publica
  // "…enfermedad - AlbertoNews - Periodismo sin censura", y quitar solo el
  // último trozo dejaría "…enfermedad - AlbertoNews" a medio limpiar.
  let actual = title;
  for (;;) {
    const recortado = recortarNombre(actual, nombres);
    if (recortado === actual) return actual;
    actual = recortado;
  }
}

/** Una pasada de `quitarNombreDelSitio`: prueba el primer prefijo y el último sufijo. */
function recortarNombre(title: string, nombres: Set<string>): string {
  const cortes = [...title.matchAll(SEPARADOR)];
  if (cortes.length === 0) return title;

  const primero = cortes[0];
  const prefijo = title.slice(0, primero.index);
  if (nombres.has(normalizarNombre(prefijo))) {
    const resto = title.slice(primero.index + primero[0].length).trim();
    if (resto) return resto;
  }

  const ultimo = cortes[cortes.length - 1];
  const sufijo = title.slice(ultimo.index + ultimo[0].length);
  if (nombres.has(normalizarNombre(sufijo))) {
    const resto = title.slice(0, ultimo.index).trim();
    if (resto) return resto;
  }

  return title;
}

/** Decodifica entidades, repara el mojibake de origen, quita el marcador de
 * truncado que deja WordPress en los excerpts automáticos y colapsa espacios
 * repetidos. */
function limpiarTexto(raw: string): string {
  return repararMojibake(decodeEntities(raw))
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
  "identidadcorrentina.com.ar": "blog-single-content",
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
  // `og:description` va primero: es el texto que el portal escribe para
  // compartir. El `<meta name="description">` genérico es donde se cuelan los
  // restos del theme —identidadcorrentina.com.ar trae dos, y la primera es
  // "Newspaper & Magazine HTML Template"—, así que solo sirve de respaldo.
  const description = cuerpo
    ? cortarTexto(cuerpo, sourceHost, LARGO_CUERPO)
    : cortarTexto(
        limpiarTexto(metaContent(html, "og:description") || metaContent(html, "description") || ""),
        sourceHost,
        LARGO_DESCRIPCION,
      );

  return {
    // Se limpia antes de recortar el nombre del sitio: mientras el separador
    // siga siendo `&raquo;` en vez de `»`, no hay dónde cortar.
    title: quitarNombreDelSitio(
      limpiarTexto(ogTitle),
      siteName ? limpiarTexto(siteName) : null,
      sourceHost,
    ),
    imageUrl,
    description,
    sourceHost,
    publishedAt: metaContent(html, "article:published_time"),
  };
}
