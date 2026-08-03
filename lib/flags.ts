import type { Pais } from "@/components/Flag";
import type { RateKey } from "@/lib/types";

/**
 * País de cada moneda, para reconocer las tarjetas de un vistazo.
 *
 * Vive aparte de `RATE_META` (`lib/rates.ts`) a propósito: es decoración de la
 * interfaz y no tiene por qué viajar en las respuestas de `/api/rates`.
 *
 * Antes esto guardaba el emoji de bandera (🇺🇸, 🇨🇴...), pero Windows no lo
 * dibuja —muestra "US", "CO" en texto— porque depende de la fuente de emoji
 * del sistema operativo. Por eso ahora se guarda solo el código de país y
 * `components/Flag.tsx` dibuja la bandera a mano en SVG, igual en cualquier
 * sistema.
 */
export const FLAGS: Record<RateKey, Pais> = {
  USD_BCV: "US",
  USD_BINANCE_BUY: "US",
  USD_BINANCE_SELL: "US",
  EUR_BCV: "EU",
  COP_OFICIAL: "CO",
  COP_FRONTERA: "CO",
  VES: "VE",
};
