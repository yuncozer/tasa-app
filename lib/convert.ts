import { RATE_ORDER } from "@/lib/rates";
import type { ConversionResult, RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Conversión cruzada usando el bolívar como pivote.
 *
 * Es una función pura y sin red, de modo que la comparte la ruta `/api/convert`
 * y la calculadora del navegador (que ya tiene la fotografía de tasas cargada y
 * así responde sin ida y vuelta al servidor).
 *
 * Ejemplo: 100 $ a tasa BCV → 100 × 748,79 = 74.879 Bs; con esos bolívares se
 * compran 74.879 ÷ 847,50 = 88,35 dólares Binance.
 */
export function convert(
  amount: number,
  from: RateKey,
  snapshot: RatesSnapshot,
): ConversionResult {
  const origin = snapshot.rates[from]?.bsPerUnit ?? null;
  const bs = origin === null ? null : amount * origin;

  const results = {} as Record<RateKey, number | null>;
  for (const key of RATE_ORDER) {
    const target = snapshot.rates[key]?.bsPerUnit ?? null;
    results[key] = bs === null || target === null || target === 0 ? null : bs / target;
  }

  return { amount, from, bs, results };
}

/** Comprueba que una cadena corresponde a una base conocida. */
export function isRateKey(value: unknown): value is RateKey {
  return typeof value === "string" && (RATE_ORDER as string[]).includes(value);
}
