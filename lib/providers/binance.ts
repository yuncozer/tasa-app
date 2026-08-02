import type { BinanceDetail } from "@/lib/types";

/**
 * Mercado P2P de Binance.
 *
 * Es el endpoint público que usa la propia web de Binance, así que no hace falta
 * API key ni el SDK. Devuelve los anuncios ordenados por mejor precio; para que
 * un anuncio suelto no distorsione la tasa se recorta el 20 % extremo de la
 * lista y se toma la mediana de lo que queda.
 *
 * Se consulta con dos monedas: USDT/VES da el dólar paralelo venezolano y
 * USDT/COP el precio real del peso. Cruzando ambas sale la tasa de frontera.
 */

const P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const ROWS = 20;
const TIMEOUT_MS = 12_000;

/** Monedas locales que consulta Tasapp. */
export type P2PFiat = "VES" | "COP";

interface P2PResponse {
  data?: { adv?: { price?: string } }[];
}

/**
 * `BUY` devuelve los anuncios en los que el usuario compra USDT pagando en
 * moneda local; `SELL`, aquellos en los que vende USDT y recibe moneda local.
 */
async function fetchSide(fiat: P2PFiat, tradeType: "BUY" | "SELL"): Promise<number[]> {
  const response = await fetch(P2P_URL, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      // Sin un User-Agent de navegador, Binance responde con una lista vacía.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    body: JSON.stringify({
      page: 1,
      rows: ROWS,
      asset: "USDT",
      fiat,
      tradeType,
      payTypes: [],
      publisherType: null,
    }),
  });

  if (!response.ok) throw new Error(`Binance P2P respondió ${response.status}`);

  const json = (await response.json()) as P2PResponse;
  const prices = (json.data ?? [])
    .map((entry) => Number(entry.adv?.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) throw new Error(`Binance P2P: sin anuncios ${tradeType}/${fiat}`);
  return prices;
}

/** Mediana descartando el 10 % de cada extremo. */
function trimmedMedian(prices: number[]): number {
  const sorted = [...prices].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.1);
  const core = sorted.length > 2 * trim + 1 ? sorted.slice(trim, sorted.length - trim) : sorted;
  const middle = Math.floor(core.length / 2);

  return core.length % 2 === 0 ? (core[middle - 1] + core[middle]) / 2 : core[middle];
}

export async function fetchBinanceRate(fiat: P2PFiat): Promise<BinanceDetail> {
  const [buyPrices, sellPrices] = await Promise.all([
    fetchSide(fiat, "BUY"),
    fetchSide(fiat, "SELL"),
  ]);

  const buy = trimmedMedian(buyPrices);
  const sell = trimmedMedian(sellPrices);

  return {
    buy,
    sell,
    mid: (buy + sell) / 2,
    ads: buyPrices.length + sellPrices.length,
  };
}
