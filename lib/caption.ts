import { formatCopRate, formatDate, formatRate, vigenciaBcv } from "@/lib/format";
import { buildFilasPesos, type FilaPesosId } from "@/lib/pesos";
import type { ArticleData } from "@/lib/providers/news";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Caption del post diario: plantilla fija, sin llamar a ningún API de IA.
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

const HASHTAGS =
  "#Venezuela #Colombia #DolarBCV #DolarParalelo #TasaDeCambio #Cucuta #Binance #EuroVenezuela #LaTasaOnline";

const TITULO_POR_MOMENTO: Record<"manana" | "tarde", string> = {
  manana: "Tasas de hoy por la mañana",
  tarde: "Tasas de hoy por la tarde",
};

export function buildCaption(snapshot: RatesSnapshot, momento?: "manana" | "tarde"): string {
  const lineas = FILAS.map(({ key, emoji }) => {
    const rate = snapshot.rates[key];
    const valor = rate.bsPerUnit === null ? "no disponible" : `${formatRate(rate.bsPerUnit)} Bs`;
    const esBcv = key === "USD_BCV" || key === "EUR_BCV";
    const vigencia = esBcv ? vigenciaBcv(rate.updatedAt) : undefined;
    return `${emoji} ${rate.label}: ${valor}${vigencia ? ` (${vigencia})` : ""}`;
  });

  const titulo = momento ? TITULO_POR_MOMENTO[momento] : "Tasas de hoy";

  return [
    `📊 ${titulo} — ${formatDate(snapshot.fetchedAt)}`,
    "",
    ...lineas,
    "",
    "Convierte cualquier monto en la calculadora completa: link en la bio.",
    "",
    HASHTAGS,
  ].join("\n");
}

const HASHTAGS_PESOS =
  "#Colombia #Venezuela #TRM #PesoColombiano #DolarHoy #TasaDeCambio #Cucuta #Binance #LaTasaOnline";

const TITULO_PESOS_POR_MOMENTO: Record<"manana" | "tarde", string> = {
  manana: "Tasas de hoy en pesos por la mañana",
  tarde: "Tasas de hoy en pesos por la tarde",
};

const EMOJI_POR_FILA_PESOS: Record<FilaPesosId, string> = {
  TRM: "🇺🇸",
  FRONTERA_BUY: "🇺🇸",
  FRONTERA_SELL: "🇺🇸",
  VES_PROMEDIO: "🇻🇪",
};

/**
 * Caption del post diario en pesos: mismo molde que `buildCaption`, con las
 * cifras del lado colombiano. Las filas salen de `buildFilasPesos` —las mismas
 * que la imagen— para que caption e imagen no puedan decir cosas distintas.
 */
export function buildPesosCaption(snapshot: RatesSnapshot, momento?: "manana" | "tarde"): string {
  const lineas = buildFilasPesos(snapshot).map((fila) => {
    const valor = fila.copPerUnit === null ? "no disponible" : `${formatCopRate(fila.copPerUnit)} COP`;
    return `${EMOJI_POR_FILA_PESOS[fila.id]} ${fila.label}: ${valor}`;
  });

  const titulo = momento ? TITULO_PESOS_POR_MOMENTO[momento] : "Tasas de hoy en pesos";

  return [
    `📊 ${titulo} — ${formatDate(snapshot.fetchedAt)}`,
    "",
    ...lineas,
    "",
    "Convierte cualquier monto en la calculadora completa: link en la bio.",
    "",
    HASHTAGS_PESOS,
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
