/**
 * Tasa Representativa del Mercado: el dólar oficial de Colombia.
 *
 * Fuente principal: el conjunto de datos abiertos que publica la
 * Superintendencia Financiera en datos.gov.co, que es de donde sale la TRM
 * certificada. Sin clave ni registro.
 *
 * Fuente de respaldo: `open.er-api.com`, una cotización internacional del peso.
 * No es la TRM —puede separarse un par de puntos— así que cuando entra en juego
 * se avisa con `warning` y la interfaz lo refleja.
 */

const TRM_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC";
const FALLBACK_URL = "https://open.er-api.com/v6/latest/USD";
const TIMEOUT_MS = 12_000;

export interface TrmRate {
  /** Pesos colombianos por 1 dólar. */
  copPerUsd: number;
  /** Fecha desde la que rige la tasa (ISO 8601). */
  updatedAt: string | null;
  source: string;
  /** Por qué se usó el respaldo, cuando la fuente principal falló. */
  warning?: string;
}

async function fetchFromDatosGov(): Promise<TrmRate> {
  const response = await fetch(TRM_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`datos.gov.co respondió ${response.status}`);

  const rows = (await response.json()) as { valor?: string; vigenciadesde?: string }[];
  const copPerUsd = Number(rows[0]?.valor);
  if (!Number.isFinite(copPerUsd) || copPerUsd <= 0) {
    throw new Error("datos.gov.co: respuesta sin valor de TRM");
  }

  // Las fechas del conjunto vienen sin zona horaria; Colombia es UTC−5.
  const raw = rows[0]?.vigenciadesde;
  const date = raw ? new Date(`${raw.replace(/\.\d+$/, "")}-05:00`) : null;

  return {
    copPerUsd,
    updatedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    source: "TRM · Banrep",
  };
}

async function fetchFromExchangeRateApi(): Promise<TrmRate> {
  const response = await fetch(FALLBACK_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ExchangeRate-API respondió ${response.status}`);

  const data = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  };

  const copPerUsd = data.rates?.COP;
  if (data.result !== "success" || typeof copPerUsd !== "number" || copPerUsd <= 0) {
    throw new Error("ExchangeRate-API: respuesta sin cotización del peso");
  }

  return {
    copPerUsd,
    updatedAt: data.time_last_update_unix
      ? new Date(data.time_last_update_unix * 1000).toISOString()
      : null,
    source: "ExchangeRate-API (aprox.)",
  };
}

/** Intenta la TRM oficial y cae al respaldo si falla. */
export async function fetchTrmRate(): Promise<TrmRate> {
  try {
    return await fetchFromDatosGov();
  } catch (trmError) {
    const reason = trmError instanceof Error ? trmError.message : String(trmError);
    try {
      const fallback = await fetchFromExchangeRateApi();
      return { ...fallback, warning: `No se pudo leer la TRM oficial (${reason})` };
    } catch {
      throw trmError;
    }
  }
}
