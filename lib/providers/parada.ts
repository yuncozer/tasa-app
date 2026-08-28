/**
 * Detección del artículo diario "Dólar en La Parada" en la categoría
 * "Frontera" de lanacionweb.com. lanacionweb no lo publica a una hora fija
 * —a diferencia del cron de tasas propio, que sí tiene horario— así que en
 * vez de conocer la URL de antemano hay que vigilar el listado y reconocer
 * el título cuando aparece.
 *
 * El cuerpo del artículo en sí lo extrae `fetchArticle()`
 * (`lib/providers/news.ts`), que ya tiene registrado `lanacionweb.com` en
 * `CONTENEDOR_POR_HOST`. Este módulo solo resuelve la URL.
 */

const TIMEOUT_MS = 12_000;
const CATEGORIA_URL = "https://lanacionweb.com/frontera/";

/** Sin acento fijo a propósito: lanacionweb ha usado "Dólar" y podría escribir "Dolar" cualquier día. */
const PATRON_TITULO = /d[oó]lar en la parada/i;

async function fetchListado(): Promise<string> {
  const response = await fetch(CATEGORIA_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LaTasa/1.0)",
      Accept: "text/html",
    },
  });
  if (!response.ok) throw new Error(`La categoría de lanacionweb respondió ${response.status}`);
  return response.text();
}

/**
 * Cualquier enlace del listado a un artículo del portal, en orden de
 * aparición.
 *
 * Antes esto buscaba solo `<h3 class="... brxe-heading ...">\s*<a href title>`,
 * que es como el theme Bricks maqueta la **lista** de artículos. El 28 de
 * agosto de 2026 eso falló en producción: el artículo más reciente no estaba
 * en esa lista sino en el bloque de destacados de arriba, que usa otro
 * marcado —un `<a class="brxe-text-basic …">` con el título como texto y sin
 * atributo `title`—. El cron seguía "detectando" la columna de ayer, que sí
 * estaba en un `<h3>`, mientras la de hoy llevaba horas publicada.
 *
 * Por eso ahora se miran **todos** los enlaces y se decide por la URL, que es
 * lo único estable entre los dos bloques: el slug de la columna siempre
 * empieza por `dolar-en-la-parada`. Un cambio de theme puede mover los
 * títulos de sitio otra vez, pero no cambia a dónde apunta el enlace.
 */
const ENLACE = /<a\b[^>]*href="(https?:\/\/lanacionweb\.com\/[^"?#]+)"([^>]*)>([\s\S]{0,300}?)<\/a>/gi;

/** El slug de la columna diaria, que es la señal que no depende del marcado. */
const SLUG_PARADA = /\/dolar-en-la-parada[^/]*\/?$/i;

/** El texto del enlace, sin las etiquetas que el theme mete dentro. */
function textoDelEnlace(atributos: string, interior: string): string {
  const conTitulo = /title="([^"]*)"/i.exec(atributos);
  if (conTitulo) return conTitulo[1];
  return interior.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * URL del artículo "Dólar en La Parada" más reciente, o `null` si no hay
 * ninguno en el listado ahora mismo — es una columna diaria, no siempre está
 * arriba en cuanto se consulta, y algunos días no se publica.
 *
 * El listado va de más reciente a más antiguo, así que basta el primer
 * enlace que case: no hace falta comparar fechas aquí. De qué día es la
 * columna lo decide después `diaDeLaColumna()` (`lib/parada.ts`), que es
 * quien evita publicar la de ayer.
 *
 * Si el sitio cambia de theme y esto deja de encontrar nada, devuelve `null`
 * en vez de romper — degradación intencional, igual que el resto de
 * proveedores del proyecto.
 */
export async function buscarArticuloParada(): Promise<{ url: string; titulo: string } | null> {
  const html = await fetchListado();

  for (const match of html.matchAll(ENLACE)) {
    const [, url, atributos, interior] = match;
    const titulo = textoDelEnlace(atributos, interior);

    // La URL manda y el título es el respaldo: el slug sobrevive a un cambio
    // de maquetación, y el título del enlace puede venir vacío o con el
    // nombre del sitio pegado según el bloque en que esté.
    if (SLUG_PARADA.test(url) || PATRON_TITULO.test(titulo)) {
      return { url, titulo };
    }
  }

  return null;
}
