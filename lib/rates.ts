import { withCache } from "@/lib/cache";
import { fetchBcvRates } from "@/lib/providers/bcv";
import { fetchBinanceRate } from "@/lib/providers/binance";
import { fetchTrmRate } from "@/lib/providers/trm";
import type { ProviderStatus, Rate, RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Arma la fotografía de tasas consultando los cuatro proveedores en paralelo.
 *
 * Se usa `allSettled` a propósito: que Binance esté caído no debe impedir ver la
 * tasa del BCV. Cada tasa que no se pudo obtener queda con `bsPerUnit: null` y
 * la interfaz la marca como no disponible.
 */

/** Cinco minutos: las tasas cambian pocas veces al día. */
const TTL_MS = 5 * 60 * 1000;

const RATE_META: Record<RateKey, Pick<Rate, "label" | "shortLabel" | "symbol">> = {
  USD_BCV: { label: "Dólar BCV", shortLabel: "$ BCV", symbol: "$" },
  USD_BINANCE: { label: "Dólar Binance", shortLabel: "$ Binance", symbol: "$" },
  EUR_BCV: { label: "Euro BCV", shortLabel: "€ BCV", symbol: "€" },
  COP_OFICIAL: { label: "Peso oficial", shortLabel: "COP oficial", symbol: "COP" },
  COP_FRONTERA: { label: "Peso frontera", shortLabel: "COP frontera", symbol: "COP" },
  VES: { label: "Bolívar", shortLabel: "Bs", symbol: "Bs" },
};

/** Orden en que se muestran las tasas y los resultados. */
export const RATE_ORDER: RateKey[] = [
  "USD_BCV",
  "USD_BINANCE",
  "EUR_BCV",
  "COP_OFICIAL",
  "COP_FRONTERA",
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

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);
}

async function buildSnapshot(): Promise<RatesSnapshot> {
  const [bcv, binanceVes, binanceCop, trm] = await Promise.allSettled([
    fetchBcvRates(),
    fetchBinanceRate("VES"),
    fetchBinanceRate("COP"),
    fetchTrmRate(),
  ]);

  const bcvData = bcv.status === "fulfilled" ? bcv.value : null;
  const vesData = binanceVes.status === "fulfilled" ? binanceVes.value : null;
  const copData = binanceCop.status === "fulfilled" ? binanceCop.value : null;
  const trmData = trm.status === "fulfilled" ? trm.value : null;

  const providers: ProviderStatus[] = [
    {
      name: "bcv",
      ok: bcv.status === "fulfilled",
      source: bcvData?.source ?? null,
      error: bcv.status === "rejected" ? describeError(bcv.reason) : null,
      warning: bcvData?.warning,
    },
    {
      name: "binance-ves",
      ok: binanceVes.status === "fulfilled",
      source: vesData ? "Binance P2P (USDT/VES)" : null,
      error: binanceVes.status === "rejected" ? describeError(binanceVes.reason) : null,
    },
    {
      name: "binance-cop",
      ok: binanceCop.status === "fulfilled",
      source: copData ? "Binance P2P (USDT/COP)" : null,
      error: binanceCop.status === "rejected" ? describeError(binanceCop.reason) : null,
    },
    {
      name: "trm",
      ok: trm.status === "fulfilled",
      source: trmData?.source ?? null,
      error: trm.status === "rejected" ? describeError(trm.reason) : null,
      warning: trmData?.warning,
    },
  ];

  // El peso no cotiza contra el bolívar: su precio en Bs sale de cruzar dos
  // dólares. Con los oficiales (BCV y TRM) da la relación de papel; con los dos
  // mercados P2P, lo que de verdad se paga en la frontera.
  const trmValue = trmData?.copPerUsd ?? null;
  const copMercado = copData?.mid ?? null;

  const bsPorPesoOficial = trmValue && bcvData?.usd ? bcvData.usd / trmValue : null;
  const bsPorPesoFrontera = vesData && copMercado ? vesData.mid / copMercado : null;

  const now = new Date().toISOString();

  const rates: Record<RateKey, Rate> = {
    USD_BCV: buildRate(
      "USD_BCV",
      bcvData?.usd ?? null,
      bcvData?.source ?? "BCV",
      bcvData?.updatedAt ?? null,
    ),
    USD_BINANCE: buildRate(
      "USD_BINANCE",
      vesData?.mid ?? null,
      "Binance P2P",
      vesData ? now : null,
      vesData
        ? `Compra ${vesData.buy.toFixed(2)} · venta ${vesData.sell.toFixed(2)}`
        : undefined,
    ),
    EUR_BCV: buildRate(
      "EUR_BCV",
      bcvData?.eur ?? null,
      bcvData?.source ?? "BCV",
      bcvData?.updatedAt ?? null,
    ),
    COP_OFICIAL: buildRate(
      "COP_OFICIAL",
      bsPorPesoOficial,
      trmData?.source ?? "TRM",
      trmData?.updatedAt ?? null,
      trmValue ? `${formatCop(trmValue)} por dólar` : undefined,
    ),
    COP_FRONTERA: buildRate(
      "COP_FRONTERA",
      bsPorPesoFrontera,
      "Binance P2P",
      copMercado ? now : null,
      copMercado ? `${formatCop(copMercado)} por dólar` : undefined,
    ),
    VES: buildRate("VES", 1, "Moneda base", null),
  };

  return {
    fetchedAt: now,
    rates,
    binance: { ves: vesData, cop: copData },
    trm: trmValue,
    copMercado,
    providers,
  };
}

/** Fotografía de tasas cacheada 5 minutos. */
export function getRates(): Promise<RatesSnapshot> {
  return withCache("rates", TTL_MS, buildSnapshot);
}
