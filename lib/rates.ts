import { withCache } from "@/lib/cache";
import { fetchBcvRates } from "@/lib/providers/bcv";
import { fetchBinanceRate } from "@/lib/providers/binance";
import { fetchCopRate } from "@/lib/providers/cop";
import type { ProviderStatus, Rate, RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Arma la fotografía de tasas consultando los tres proveedores en paralelo.
 *
 * Se usa `allSettled` a propósito: que Binance esté caído no debe impedir ver la
 * tasa del BCV. Cada tasa que no se pudo obtener queda con `bsPerUnit: null` y
 * la interfaz la marca como no disponible.
 */

/** Cinco minutos: las tasas cambian pocas veces al día. */
const TTL_MS = 5 * 60 * 1000;

const RATE_META: Record<RateKey, Pick<Rate, "label" | "shortLabel" | "symbol">> = {
  USD_BCV: { label: "Dólar BCV", shortLabel: "$ BCV", symbol: "$" },
  USD_BINANCE: { label: "Dólar Binance P2P", shortLabel: "$ Binance", symbol: "$" },
  EUR_BCV: { label: "Euro BCV", shortLabel: "€ BCV", symbol: "€" },
  COP_BCV: { label: "Peso colombiano (cruce BCV)", shortLabel: "COP · BCV", symbol: "COL$" },
  COP_BINANCE: {
    label: "Peso colombiano (cruce Binance)",
    shortLabel: "COP · Binance",
    symbol: "COL$",
  },
  VES: { label: "Bolívar", shortLabel: "Bs", symbol: "Bs" },
};

/** Orden en que se muestran las tasas y los resultados. */
export const RATE_ORDER: RateKey[] = [
  "USD_BCV",
  "USD_BINANCE",
  "EUR_BCV",
  "COP_BCV",
  "COP_BINANCE",
  "VES",
];

export function rateMeta(key: RateKey): Pick<Rate, "label" | "shortLabel" | "symbol"> {
  return RATE_META[key];
}

function buildRate(
  key: RateKey,
  bsPerUnit: number | null,
  source: string,
  updatedAt: string | null,
  note?: string,
): Rate {
  return { key, ...RATE_META[key], bsPerUnit, source, updatedAt, note };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function buildSnapshot(): Promise<RatesSnapshot> {
  const [bcv, binance, cop] = await Promise.allSettled([
    fetchBcvRates(),
    fetchBinanceRate(),
    fetchCopRate(),
  ]);

  const bcvData = bcv.status === "fulfilled" ? bcv.value : null;
  const binanceData = binance.status === "fulfilled" ? binance.value : null;
  const copData = cop.status === "fulfilled" ? cop.value : null;

  const providers: ProviderStatus[] = [
    {
      name: "bcv",
      ok: bcv.status === "fulfilled",
      source: bcvData?.source ?? null,
      error: bcv.status === "rejected" ? describeError(bcv.reason) : null,
      warning: bcvData?.warning,
    },
    {
      name: "binance",
      ok: binance.status === "fulfilled",
      source: binanceData ? "Binance P2P (USDT/VES)" : null,
      error: binance.status === "rejected" ? describeError(binance.reason) : null,
    },
    {
      name: "cop",
      ok: cop.status === "fulfilled",
      source: copData?.source ?? null,
      error: cop.status === "rejected" ? describeError(cop.reason) : null,
    },
  ];

  // El peso no cotiza contra el bolívar: su precio en Bs es un cruce vía dólar.
  // Se calculan las dos versiones porque en la frontera conviven ambas lógicas.
  const usdCop = copData?.usdCop ?? null;
  const bsPerCop = (bsPerUsd: number | null | undefined): number | null =>
    usdCop && bsPerUsd ? bsPerUsd / usdCop : null;

  const copNote = usdCop ? `1 USD = ${usdCop.toFixed(2)} COP` : undefined;

  const rates: Record<RateKey, Rate> = {
    USD_BCV: buildRate(
      "USD_BCV",
      bcvData?.usd ?? null,
      bcvData?.source ?? "BCV",
      bcvData?.updatedAt ?? null,
    ),
    USD_BINANCE: buildRate(
      "USD_BINANCE",
      binanceData?.mid ?? null,
      "Binance P2P (USDT/VES)",
      binanceData ? new Date().toISOString() : null,
      binanceData
        ? `Compra ${binanceData.buy.toFixed(2)} · Venta ${binanceData.sell.toFixed(2)}`
        : undefined,
    ),
    EUR_BCV: buildRate(
      "EUR_BCV",
      bcvData?.eur ?? null,
      bcvData?.source ?? "BCV",
      bcvData?.updatedAt ?? null,
    ),
    COP_BCV: buildRate(
      "COP_BCV",
      bsPerCop(bcvData?.usd),
      copData?.source ?? "ExchangeRate-API",
      copData?.updatedAt ?? null,
      copNote,
    ),
    COP_BINANCE: buildRate(
      "COP_BINANCE",
      bsPerCop(binanceData?.mid),
      copData?.source ?? "ExchangeRate-API",
      copData?.updatedAt ?? null,
      copNote,
    ),
    VES: buildRate("VES", 1, "Moneda base", null),
  };

  return {
    fetchedAt: new Date().toISOString(),
    rates,
    binance: binanceData,
    usdCop,
    providers,
  };
}

/** Fotografía de tasas cacheada 5 minutos. */
export function getRates(): Promise<RatesSnapshot> {
  return withCache("rates", TTL_MS, buildSnapshot);
}
