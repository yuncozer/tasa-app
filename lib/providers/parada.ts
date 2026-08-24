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
 * Cada título de artículo en el listado va como `<h3 class="... brxe-heading
 * ...">\s*<a href="URL" ... title="TÍTULO">`, con `brxe-heading` del
 * constructor Bricks que usa el sitio — verificado en vivo el 2026-08-24.
 * Igual que `CONTENEDOR_POR_HOST` en `lib/providers/news.ts`, esto es
 * específico del theme de este portal y no algo genérico.
 */
const TITULO_ARTICULO = /<h3[^>]*brxe-heading[^>]*>\s*<a href="([^"]+)"[^>]*title="([^"]*)"/gi;

/**
 * URL del artículo "Dólar en La Parada" más reciente, o `null` si no hay
 * ninguno en el listado ahora mismo — es una columna diaria, no siempre está
 * arriba en cuanto se consulta, y algunos días no se publica.
 *
 * El listado va de más reciente a más antiguo, así que basta el primer
 * `<h3>` que case con el título: no hace falta comparar fechas.
 *
 * Si el sitio cambia de theme y esta expresión regular deja de encontrar
 * nada, devuelve `null` en vez de romper — degradación intencional, igual
 * que el resto de proveedores del proyecto.
 */
export async function buscarArticuloParada(): Promise<{ url: string; titulo: string } | null> {
  const html = await fetchListado();

  for (const match of html.matchAll(TITULO_ARTICULO)) {
    const [, url, titulo] = match;
    if (PATRON_TITULO.test(titulo)) return { url, titulo };
  }

  return null;
}
