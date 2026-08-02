/**
 * Tipos compartidos por la capa de proveedores, la API REST y la interfaz.
 *
 * Toda la aplicación gira alrededor de una idea: cada moneda tiene un precio en
 * bolívares (`bsPerUnit`). El bolívar es el pivote de todas las conversiones, así
 * que basta con conocer ese número por moneda para poder cruzar cualquier par.
 */

/** Bases de cotización que maneja Tasapp. */
export type RateKey =
  | "USD_BCV"
  | "USD_BINANCE"
  | "EUR_BCV"
  | "COP_OFICIAL"
  | "COP_FRONTERA"
  | "VES";

/** Una cotización lista para mostrar o para calcular. */
export interface Rate {
  key: RateKey;
  /** Nombre largo, p. ej. "Dólar BCV". */
  label: string;
  /** Nombre corto para los botones del selector, p. ej. "$ BCV". */
  shortLabel: string;
  /** Símbolo de la moneda, p. ej. "$". */
  symbol: string;
  /** Bolívares que cuesta 1 unidad de esta moneda. `null` si la fuente falló. */
  bsPerUnit: number | null;
  /** De dónde salió el dato. */
  source: string;
  /** Fecha del dato (ISO 8601) según la fuente. */
  updatedAt: string | null;
  /** Explicación corta del cálculo, útil en las tasas cruzadas del peso. */
  note?: string;
}

/** Detalle del mercado P2P de Binance para una moneda local. */
export interface BinanceDetail {
  /** Precio al que el usuario compra USDT pagando en moneda local. */
  buy: number;
  /** Precio al que el usuario vende USDT y recibe moneda local. */
  sell: number;
  /** Punto medio entre `buy` y `sell`: la tasa que usa la calculadora. */
  mid: number;
  /** Anuncios considerados para calcular las medianas. */
  ads: number;
}

/** Estado de un proveedor externo en la última consulta. */
export interface ProviderStatus {
  name: string;
  ok: boolean;
  source: string | null;
  error: string | null;
  /** Aviso cuando el proveedor respondió pero con datos degradados. */
  warning?: string;
}

/** Fotografía completa de las tasas del día. */
export interface RatesSnapshot {
  /** Momento en que se armó esta fotografía (ISO 8601). */
  fetchedAt: string;
  rates: Record<RateKey, Rate>;
  /** Compra/venta del P2P en cada moneda; `null` la que haya fallado. */
  binance: { ves: BinanceDetail | null; cop: BinanceDetail | null };
  /** Pesos por dólar según la TRM oficial de Colombia. */
  trm: number | null;
  /** Pesos por dólar en el mercado P2P. */
  copMercado: number | null;
  providers: ProviderStatus[];
}

/** Resultado de convertir un monto a todas las demás bases. */
export interface ConversionResult {
  amount: number;
  from: RateKey;
  /** Bolívares equivalentes al monto de origen. */
  bs: number | null;
  /** Monto equivalente en cada base (`null` si esa tasa no está disponible). */
  results: Record<RateKey, number | null>;
}
