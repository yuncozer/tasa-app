import { formatCopRate, formatDate, formatRate, vigenciaBcv } from "@/lib/format";
import { buildFilasPesos, type FilaPesosId } from "@/lib/pesos";
import type { ArticleData } from "@/lib/providers/news";
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
    return `${emoji} ${rate.label}: ${valor}${vigencia ? ` (${vigencia})` : ""}`;
  });
}

/**
 * Bloque de cifras de la segunda diapositiva: todo en pesos. Las filas salen
 * de `buildFilasPesos` —las mismas que la imagen— para que caption e imagen no
 * puedan decir cosas distintas.
 */
function lineasEnPesos(snapshot: RatesSnapshot): string[] {
  return buildFilasPesos(snapshot).map((fila) => {
    const valor = fila.copPerUnit === null ? "no disponible" : `${formatCopRate(fila.copPerUnit)} COP`;
    return `${EMOJI_POR_FILA_PESOS[fila.id]} ${fila.label}: ${valor}`;
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
