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

/**
 * Contra qué moneda se resume una conversión cuando hay que dar **una sola**
 * cifra: el renglón destacado de la calculadora, y la línea del texto que
 * acompaña a la imagen compartida.
 *
 * Casi siempre el bolívar, que es el pivote de toda la app y el paso que la
 * pantalla destaca antes de abrir el abanico. La excepción es que el origen
 * **ya sea** el bolívar: ahí la cuenta es un no-op y salía "80.739,00 Bs =
 * 80.739,00 Bs", un renglón que ocupa el sitio de honor para no decir nada. Es
 * un caso alcanzable, porque "Bs" está en el selector de monedas.
 *
 * En ese caso se asciende la primera de `RATE_ORDER` con precio — el dólar BCV
 * salvo que esté caído—, que es también la primera fila que enseñan la lista de
 * equivalencias y la imagen. Quien la consume tiene que **quitarla de la
 * lista**: si no, la misma cifra saldría dos veces.
 *
 * Vive aquí y no en cada pantalla porque es exactamente la clase de regla que se
 * desincroniza: la calculadora, la imagen y el texto que viajan en el mismo
 * mensaje no pueden resumir cosas distintas.
 *
 * Si ninguna otra tasa tiene precio cae al bolívar, o sea a la tautología. Es el
 * estado en que la app entera está caída y todas las filas dicen "no
 * disponible": no vale la pena una rama más para adornarlo.
 */
export function destinoPrincipal(conversion: ConversionResult): RateKey {
  if (conversion.from !== "VES") return "VES";

  return RATE_ORDER.find((clave) => clave !== "VES" && conversion.results[clave] !== null) ?? "VES";
}

/** Comprueba que una cadena corresponde a una base conocida. */
export function isRateKey(value: unknown): value is RateKey {
  return typeof value === "string" && (RATE_ORDER as string[]).includes(value);
}
