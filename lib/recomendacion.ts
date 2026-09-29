import type { ConversionResult, RateKey } from "@/lib/types";

/**
 * Qué conviene para pagar el monto de la calculadora, según la zona.
 *
 * **No inventa ninguna cifra**: compara dos filas que la lista de
 * equivalencias ya enseña justo debajo, así que el lector puede comprobarla
 * con sus propios ojos. Es la regla de siempre —lo que se muestra es lo que se
 * calcula— aplicada a una frase.
 *
 * - **Interior**: dólar BCV frente a Binance (venta). Quien paga con dólares
 *   puede entregarlos a tasa BCV o venderlos en Binance y pagar en bolívares;
 *   se usa la **venta** porque es "lo que recibes por cada dólar que vendas",
 *   el lado del mercado de quien paga.
 * - **Frontera**: peso oficial frente a peso Binance. Es la pregunta de allá:
 *   con qué tasa aceptar que le cobren en pesos.
 *
 * Se habla siempre desde **quien paga**: menos unidades entregadas es mejor.
 * Quien cobra lee lo contrario, y eso lo aclara la ayuda del tooltip.
 */

export type Zona = "interior" | "frontera";

export interface Recomendacion {
  /** Fila de la lista que rinde más: la que se señala. */
  mejor: RateKey;
  /** Fila con la que se compara. */
  peor: RateKey;
  /** Cuánto menos se entrega con la mejor, en porcentaje. */
  ahorro: number;
}

const PARES: Record<Zona, [RateKey, RateKey]> = {
  interior: ["USD_BCV", "USD_BINANCE_SELL"],
  frontera: ["COP_OFICIAL", "COP_FRONTERA"],
};

/**
 * `null` cuando falta alguna de las dos tasas, cuando no hay monto o cuando
 * las dos opciones dan lo mismo: sin dato no se inventa un dato, y un consejo
 * de "0,0 % menos" es ruido.
 */
export function recomendar(conversion: ConversionResult, zona: Zona): Recomendacion | null {
  const [a, b] = PARES[zona];
  const va = conversion.results[a];
  const vb = conversion.results[b];
  if (va === null || vb === null || !(va > 0) || !(vb > 0)) return null;

  const [mejor, peor, vMejor, vPeor] = va < vb ? [a, b, va, vb] : [b, a, vb, va];
  const ahorro = (1 - vMejor / vPeor) * 100;
  if (!(ahorro >= 0.05)) return null;

  return { mejor, peor, ahorro };
}
