import { formatDate, formatRate, vigenciaBcv } from "@/lib/format";
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
  "#Venezuela #Colombia #DolarBCV #DolarParalelo #TasaDeCambio #Cucuta #Binance #EuroVenezuela";

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
