import type { RateKey } from "@/lib/types";

/**
 * Formato de números en español de Venezuela: punto para miles, coma para
 * decimales. Los pesos se muestran sin decimales porque nadie cotiza centavos
 * de peso, y los bolívares con dos.
 */

const DECIMALS: Record<RateKey, number> = {
  USD_BCV: 2,
  USD_BINANCE: 2,
  EUR_BCV: 2,
  COP_BCV: 0,
  COP_BINANCE: 0,
  VES: 2,
};

export function formatAmount(value: number | null, key: RateKey): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const decimals = DECIMALS[key];
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Las tasas se muestran con más precisión que los montos: el peso vale
 * fracciones de bolívar y con dos decimales se perdería la diferencia entre el
 * cruce BCV y el de Binance.
 */
export function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const decimals = value < 1 ? 4 : 2;
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Venezuela usa UTC−4 todo el año, sin horario de verano desde 2016. */
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * Fecha corta en hora de Caracas, p. ej. "3 ago, 12:30".
 *
 * Se arma a mano en vez de con `Intl.DateTimeFormat` porque servidor y
 * navegador pueden traer versiones distintas de ICU y devolver textos que no
 * coinciden ("12:00 a. m." frente a "12:00 a.m."), lo que rompía la hidratación.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const caracas = new Date(date.getTime() - CARACAS_OFFSET_MS);
  const hora = String(caracas.getUTCHours()).padStart(2, "0");
  const minuto = String(caracas.getUTCMinutes()).padStart(2, "0");

  return `${caracas.getUTCDate()} ${MESES[caracas.getUTCMonth()]}, ${hora}:${minuto}`;
}

/** Convierte lo tecleado en la calculadora ("1.234,56") a número. */
export function parseInput(raw: string): number {
  if (!raw) return 0;
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}
