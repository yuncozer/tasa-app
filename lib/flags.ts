import type { RateKey } from "@/lib/types";

/**
 * Bandera de cada moneda, para reconocer las tarjetas de un vistazo.
 *
 * Vive aparte de `RATE_META` (`lib/rates.ts`) a propósito: es decoración de la
 * interfaz y no tiene por qué viajar en las respuestas de `/api/rates`.
 *
 * Nota: Windows no dibuja banderas en su fuente de emoji y muestra las letras
 * del país ("US", "CO"). Sigue siendo identificable, pero explica por qué en ese
 * sistema no se ve igual que en el teléfono.
 */
export const FLAGS: Record<RateKey, string> = {
  USD_BCV: "🇺🇸",
  USD_BINANCE: "🇺🇸",
  EUR_BCV: "🇪🇺",
  COP_BCV: "🇨🇴",
  COP_BINANCE: "🇨🇴",
  VES: "🇻🇪",
};
