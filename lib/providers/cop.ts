/**
 * Cotización internacional del peso colombiano (pesos por dólar).
 *
 * open.er-api.com es el plan abierto de ExchangeRate-API: sin clave, sin
 * registro y con actualización diaria. La ruta `v6` que aparecía en la
 * documentación de referencia exige una API key, y Frankfurter —la otra
 * alternativa sugerida— solo cubre las monedas del BCE, sin COP ni VES.
 */

const COP_URL = "https://open.er-api.com/v6/latest/USD";
const TIMEOUT_MS = 12_000;

export interface CopRate {
  /** Pesos colombianos por 1 dólar. */
  usdCop: number;
  updatedAt: string | null;
  source: string;
}

export async function fetchCopRate(): Promise<CopRate> {
  const response = await fetch(COP_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ExchangeRate-API respondió ${response.status}`);

  const data = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  };

  const usdCop = data.rates?.COP;
  if (data.result !== "success" || typeof usdCop !== "number" || usdCop <= 0) {
    throw new Error("ExchangeRate-API: respuesta sin cotización del peso");
  }

  return {
    usdCop,
    updatedAt: data.time_last_update_unix
      ? new Date(data.time_last_update_unix * 1000).toISOString()
      : null,
    source: "ExchangeRate-API (open)",
  };
}
