import { convert } from "@/lib/convert";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Las tasas del día vistas desde el lado colombiano de la frontera: cuánto
 * vale cada cosa **en pesos**, no en bolívares.
 *
 * Vive aquí y no dentro de la ruta de la imagen porque la consumen dos sitios
 * —`app/api/og/instagram-post-pesos` y `buildPesosCaption` en `lib/caption.ts`—
 * y son el mismo post: si cada uno armara su lista, la imagen y el caption
 * podrían acabar diciendo cosas distintas.
 *
 * Todo se calcula con `convert()`, la misma función pura que usan la
 * calculadora y `/api/convert`. Así el número publicado es exactamente el que
 * da la app, y como `buildRate()` ya redondeó `bsPerUnit` a la precisión con
 * que se muestra, la cuenta también se puede reproducir a mano.
 */

export type FilaPesosId = "TRM" | "FRONTERA_BUY" | "FRONTERA_SELL" | "VES_PROMEDIO";

export interface FilaPesos {
  id: FilaPesosId;
  label: string;
  /** Cuántos pesos vale una unidad de la moneda. `null` si la fuente falló. */
  copPerUnit: number | null;
}

/** Cuántos pesos vale una unidad de `from`, cruzando por el peso frontera. */
function enPesos(snapshot: RatesSnapshot, from: Parameters<typeof convert>[1]): number | null {
  return convert(1, from, snapshot).results.COP_FRONTERA;
}

export function buildFilasPesos(snapshot: RatesSnapshot): FilaPesos[] {
  return [
    {
      id: "TRM",
      label: "Dólar TRM",
      // La TRM se toma tal cual la publica el Banco de la República. Derivarla
      // de las tasas en bolívares (USD_BCV ÷ COP_OFICIAL) daría lo mismo por
      // construcción, pero con la deriva de dos redondeos encima, y esto es
      // una cifra oficial que el lector puede contrastar con la fuente.
      copPerUnit: snapshot.trm,
    },
    {
      id: "FRONTERA_BUY",
      label: "Dólar frontera (compra)",
      copPerUnit: enPesos(snapshot, "USD_BINANCE_BUY"),
    },
    {
      id: "FRONTERA_SELL",
      label: "Dólar frontera (venta)",
      copPerUnit: enPesos(snapshot, "USD_BINANCE_SELL"),
    },
    {
      id: "VES_PROMEDIO",
      label: "Bolívar (promedio)",
      // Es el promedio del dólar frontera de compra y venta, expresado por
      // bolívar. No hace falta promediar nada a mano: las dos filas de arriba
      // dividen entre la MISMA tasa del peso frontera, así que
      // (compra ÷ Bs_compra + venta ÷ Bs_venta) ÷ 2 se simplifica a
      // 1 ÷ COP_FRONTERA, que es justo lo que devuelve convertir un bolívar.
      // No lo "corrijas" a un promedio explícito: daría el mismo número con
      // más redondeos por el camino.
      copPerUnit: enPesos(snapshot, "VES"),
    },
  ];
}
