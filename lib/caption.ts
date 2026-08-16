import { formatDate, formatRate, formatVariacion, vigenciaBcv } from "@/lib/format";
import { buildFilasPesos, type FilaPesosId } from "@/lib/pesos";
import type { ArticleData } from "@/lib/providers/news";
import type { FilaSemanal, FilaSemanalId, ReporteSemanal } from "@/lib/semanal";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Caption del post diario: plantilla fija, sin llamar a ningún API de IA.
 *
 * El post es un carrusel de dos diapositivas —las tasas en bolívares y las
 * mismas en pesos— y el caption es uno solo, el del contenedor padre. Por eso
 * lleva los dos bloques de cifras: la segunda diapositiva solo se ve si el
 * lector desliza, así que los números en pesos tienen que estar también aquí,
 * donde se pueden leer, copiar y buscar sin deslizar nada.
 *
 * El aviso legal no se repite aquí: Instagram trunca el caption a un tap de
 * "más" tras ~125 caracteres, así que meterlo ahí lo esconde justo lo
 * contrario de lo que busca un aviso obligatorio. Vive una sola vez,
 * completo y siempre visible, en la imagen del post.
 */

const FILAS: Array<{ key: RateKey; emoji: string }> = [
  { key: "USD_BCV", emoji: "🇺🇸" },
  { key: "USD_BINANCE_BUY", emoji: "🟡" },
  { key: "USD_BINANCE_SELL", emoji: "🟡" },
  { key: "EUR_BCV", emoji: "🇪🇺" },
  { key: "COP_FRONTERA", emoji: "🇨🇴" },
];

const EMOJI_POR_FILA_PESOS: Record<FilaPesosId, string> = {
  TRM: "🇺🇸",
  FRONTERA_BUY: "🇺🇸",
  FRONTERA_SELL: "🇺🇸",
  VES_PROMEDIO: "🇻🇪",
};

/** Los dos juegos de etiquetas, sin repetir ninguna: es un solo post. */
const HASHTAGS =
  "#Venezuela #Colombia #DolarBCV #DolarParalelo #TasaDeCambio #Cucuta #Binance " +
  "#EuroVenezuela #TRM #PesoColombiano #LaTasaOnline";

const TITULO_POR_MOMENTO: Record<"manana" | "tarde", string> = {
  manana: "Tasas de hoy por la mañana",
  tarde: "Tasas de hoy por la tarde",
};

/** Bloque de cifras de la primera diapositiva: todo en bolívares. */
function lineasEnBolivares(snapshot: RatesSnapshot): string[] {
  return FILAS.map(({ key, emoji }) => {
    const rate = snapshot.rates[key];
    const valor = rate.bsPerUnit === null ? "no disponible" : `${formatRate(rate.bsPerUnit)} Bs`;
    const esBcv = key === "USD_BCV" || key === "EUR_BCV";
    const vigencia = esBcv ? vigenciaBcv(rate.updatedAt) : undefined;
    // Igual que en la imagen: el peso frontera declara su fuente, porque su
    // nombre no la nombra y se leería como una tasa de las casas de cambio.
    const fuente = key === "COP_FRONTERA" ? rate.source : undefined;
    return `${emoji} ${rate.label}: ${valor}${vigencia ? ` (${vigencia})` : ""}${fuente ? ` (${fuente})` : ""}`;
  });
}

/**
 * Bloque de cifras de la segunda diapositiva: todo en pesos. Las filas salen
 * de `buildFilasPesos` —las mismas que la imagen— para que caption e imagen no
 * puedan decir cosas distintas.
 */
function lineasEnPesos(snapshot: RatesSnapshot): string[] {
  return buildFilasPesos(snapshot).map((fila) => {
    const valor = fila.copPerUnit === null ? "no disponible" : `${formatRate(fila.copPerUnit)} COP`;
    return `${EMOJI_POR_FILA_PESOS[fila.id]} ${fila.label}: ${valor}${fila.fuente ? ` (${fila.fuente})` : ""}`;
  });
}

export function buildCaption(snapshot: RatesSnapshot, momento?: "manana" | "tarde"): string {
  const titulo = momento ? TITULO_POR_MOMENTO[momento] : "Tasas de hoy";

  return [
    `📊 ${titulo} — ${formatDate(snapshot.fetchedAt)}`,
    "",
    "En bolívares:",
    ...lineasEnBolivares(snapshot),
    "",
    "En pesos colombianos (desliza →):",
    ...lineasEnPesos(snapshot),
    "",
    "Convierte cualquier monto en la calculadora completa: link en la bio.",
    "",
    HASHTAGS,
  ].join("\n");
}

const HASHTAGS_SEMANAL =
  "#Venezuela #Colombia #DolarBCV #TasaDeCambio #Binance #TRM #PesoColombiano " +
  "#Cucuta #ResumenSemanal #LaTasaOnline";

const EMOJI_POR_FILA_SEMANAL: Record<FilaSemanalId, string> = {
  USD_BCV: "🇺🇸",
  BRECHA: "📊",
  TRM: "🇨🇴",
};

/** De dónde salen las tres cifras. En la imagen va en el pie; aquí, buscable y copiable. */
const FUENTES_SEMANAL = "Fuentes: BCV, Binance P2P y Banco de la República (TRM).";

/**
 * Con qué abre el caption.
 *
 * Instagram corta el texto tras ~125 caracteres, así que esa primera línea es
 * lo único que se lee sin pulsar "más": repetir ahí el titular que ya se lee
 * enorme en la imagen es desperdiciarla. Se abre con el movimiento más fuerte
 * de la semana.
 *
 * **Solo se comparan filas de la misma unidad.** Un 1,4 % y un 2,7 pp no son
 * magnitudes comparables —uno es un cambio relativo y el otro una diferencia
 * entre porcentajes—, así que la contienda es entre el dólar y la TRM, y la
 * brecha solo encabeza si es la única con comparación. Elegir por el número más
 * grande a secas haría ganar casi siempre a la brecha, que se mueve en una
 * escala distinta.
 *
 * Sin ninguna comparación se cae al titular de la imagen, que es lo único
 * cierto que queda por decir.
 */
function titularSemanal(reporte: ReporteSemanal): string {
  const conCambio = reporte.filas.filter((fila) => fila.direccion === "sube" || fila.direccion === "baja");
  const enPorcentaje = conCambio.filter((fila) => fila.unidadVariacion === "porcentaje");
  const candidatas = enPorcentaje.length > 0 ? enPorcentaje : conCambio;

  const destacada = candidatas.reduce<FilaSemanal | null>(
    (mejor, fila) => (mejor === null || Math.abs(fila.variacion!) > Math.abs(mejor.variacion!) ? fila : mejor),
    null,
  );

  if (!destacada) return `📈 Así se movieron las tasas esta semana (${reporte.rangoTexto})`;

  const verbo = destacada.direccion === "sube" ? "subió" : "bajó";
  const magnitud = formatVariacion(destacada.variacion, destacada.unidadVariacion);

  // El rango va entre paréntesis y no tras un guion: la frase ya lleva uno
  // dentro ("Lunes 10 — Domingo 16") y encadenar dos se lee fatal.
  return `📈 ${destacada.sujeto} ${verbo} ${magnitud} esta semana (${reporte.rangoTexto})`;
}

/**
 * Caption del reporte semanal.
 *
 * Consume las filas que ya armó `lib/semanal.ts` —las mismas que la imagen—
 * por el mismo motivo que `lineasEnPesos`: son el mismo post y no pueden acabar
 * diciendo cosas distintas. El aviso legal tampoco se repite aquí; vive
 * completo en la imagen.
 *
 * La flecha viaja en el texto y la magnitud llega ya en valor absoluto desde
 * `formatVariacion`, así que el signo se dice una sola vez.
 */
export function buildCaptionSemanal(reporte: ReporteSemanal): string {
  const lineas = reporte.filas.map((fila) => {
    const emoji = EMOJI_POR_FILA_SEMANAL[fila.id];
    const valor = fila.valor === null ? "no disponible" : fila.valorTexto;

    if (fila.direccion === "desconocida") {
      return `${emoji} ${fila.titulo}: ${valor} (sin comparación: aún no hay una semana de histórico)`;
    }

    if (fila.direccion === "igual") {
      return `${emoji} ${fila.titulo}: ${valor} (sin cambios en la semana)`;
    }

    const flecha = fila.direccion === "sube" ? "↑" : "↓";
    // La unidad se aclara pegada al número que la usa, y no en un párrafo
    // aparte: se explica una sola vez, donde de verdad se lee.
    const aclaracion = fila.unidadVariacion === "puntos" ? " —puntos porcentuales—" : "";

    return (
      `${emoji} ${fila.titulo}: ${valor} ` +
      `(${flecha} ${formatVariacion(fila.variacion, fila.unidadVariacion)}${aclaracion} en la semana)`
    );
  });

  return [
    titularSemanal(reporte),
    "",
    ...lineas,
    "",
    "Convierte cualquier monto en la calculadora completa: link en la bio.",
    "",
    FUENTES_SEMANAL,
    "",
    HASHTAGS_SEMANAL,
  ].join("\n");
}

const HASHTAGS_NOTICIA = "#Venezuela #Colombia #Economía #Noticias #DolarBCV #LaTasaOnline";

/**
 * Caption del post ocasional de noticia: plantilla fija, sin IA — igual que
 * `buildCaption`. El aviso legal tampoco se repite aquí por la misma razón:
 * ya vive completo en la imagen.
 */
export function buildNewsCaption(article: ArticleData): string {
  return [
    `📰 ${article.title}`,
    "",
    article.description,
    "",
    `Fuente: ${article.sourceHost}`,
    "",
    HASHTAGS_NOTICIA,
  ].join("\n");
}
