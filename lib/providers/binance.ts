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
 *
 * El precio del mejor anuncio sin filtrar no es representativo: la tasa real
 * cambia según el monto (los anuncios tienen límites min/max) y, en VES,
 * también según el método de pago. Por eso la tasa final se calcula sobre una
 * operación de referencia (`REFERENCE_USD_AMOUNT` dólares; en VES además vía
 * `REFERENCE_PAY_TYPE`), no sobre el listado completo sin filtrar.
 */

const P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const ROWS = 20;
const TIMEOUT_MS = 12_000;

const DEFAULT_REFERENCE_USD_AMOUNT = 100;
const referenceAmountEnv = Number(process.env.BINANCE_REFERENCE_USD_AMOUNT);
/** Monto (en USD) de la operación de referencia usada para filtrar anuncios. */
const REFERENCE_USD_AMOUNT =
  Number.isFinite(referenceAmountEnv) && referenceAmountEnv > 0
    ? referenceAmountEnv
    : DEFAULT_REFERENCE_USD_AMOUNT;

/**
 * Identificador real de Binance para "Pago Móvil", el método más usado en
 * Venezuela. No se aplica al lado COP: Binance usa otros identificadores para
 * los métodos de pago colombianos y no está verificado cuál corresponde.
 */
const REFERENCE_PAY_TYPE = process.env.BINANCE_REFERENCE_PAY_TYPE ?? "PagoMovil";

/** Monedas locales que consulta Tasapp. */
export type P2PFiat = "VES" | "COP";

interface P2PResponse {
  data?: { adv?: { price?: string } }[];
}

interface SideFilters {
  payTypes?: string[];
  /** Monto en la moneda local que debe cubrir el rango min/max del anuncio. */
  transAmount?: number;
}

/**
 * `BUY` devuelve los anuncios en los que el usuario compra USDT pagando en
 * moneda local; `SELL`, aquellos en los que vende USDT y recibe moneda local.
 */
async function fetchSide(
  fiat: P2PFiat,
  tradeType: "BUY" | "SELL",
  filters?: SideFilters,
): Promise<number[]> {
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
      payTypes: filters?.payTypes ?? [],
      publisherType: null,
      ...(filters?.transAmount ? { transAmount: String(filters.transAmount) } : {}),
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

/**
 * Precio de un lado (BUY o SELL) para la operación de referencia: vuelve a
 * consultar Binance filtrando por `transAmount` (y, en VES, `payTypes`) a
 * partir de un precio aproximado (`bootstrapPrice`, sin filtrar) usado solo
 * para convertir `REFERENCE_USD_AMOUNT` a moneda local. Si el filtro no trae
 * anuncios (poca liquidez con ese monto/método de pago), se degrada al precio
 * sin filtrar en vez de romper el fetch completo.
 */
async function fetchReferenceSide(
  fiat: P2PFiat,
  tradeType: "BUY" | "SELL",
  bootstrapPrice: number,
): Promise<{ price: number; ads: number }> {
  const transAmount = Math.round(bootstrapPrice * REFERENCE_USD_AMOUNT);
  const payTypes = fiat === "VES" ? [REFERENCE_PAY_TYPE] : [];

  try {
    const prices = await fetchSide(fiat, tradeType, { payTypes, transAmount });
    return { price: trimmedMedian(prices), ads: prices.length };
  } catch {
    return { price: bootstrapPrice, ads: 0 };
  }
}

export async function fetchBinanceRate(fiat: P2PFiat): Promise<BinanceDetail> {
  const [bootstrapBuyPrices, bootstrapSellPrices] = await Promise.all([
    fetchSide(fiat, "BUY"),
    fetchSide(fiat, "SELL"),
  ]);

  const bootstrapBuy = trimmedMedian(bootstrapBuyPrices);
  const bootstrapSell = trimmedMedian(bootstrapSellPrices);

  const [buySide, sellSide] = await Promise.all([
    fetchReferenceSide(fiat, "BUY", bootstrapBuy),
    fetchReferenceSide(fiat, "SELL", bootstrapSell),
  ]);

  return {
    buy: buySide.price,
    sell: sellSide.price,
    mid: (buySide.price + sellSide.price) / 2,
    ads: buySide.ads + sellSide.ads,
  };
}
