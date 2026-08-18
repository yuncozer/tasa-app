import type { RatesSnapshot } from "@/lib/types";

/**
 * La brecha entre la tasa oficial y la del mercado P2P: cuánto se paga de más
 * fuera del BCV.
 *
 * Vive aquí y no dentro de `lib/semanal.ts` porque la consumen dos sitios que
 * no pueden decir cosas distintas: la franja de la portada, que la enseña cada
 * vez que alguien abre la app, y la tarjeta del reporte semanal que se publica
 * el domingo. Es el mismo motivo por el que `lib/pesos.ts` y `lib/semanal.ts`
 * viven aparte de las plantillas que los dibujan — si cada consumidor hiciera
 * su propia cuenta, podría publicarse un porcentaje distinto del que la gente
 * lleva toda la semana viendo en pantalla.
 */

/**
 * Cuánto se paga de más fuera del BCV, en porcentaje.
 *
 * Se usa la **venta** de Binance y **no** el `mid` de `BinanceDetail`: compra y
 * venta dejaron de promediarse a propósito porque la diferencia entre ambas es
 * real y esconderla da una imagen falsa del mercado (ver `CLAUDE.md`); `mid`
 * sobrevive solo porque `COP_FRONTERA` lo necesita para el cruce VES↔COP. Una
 * cifra que dice "brecha" tiene que nombrar un lado del mercado, y el que
 * responde a la pregunta del lector —cuánto pago de más— es la venta.
 *
 * Devuelve `null` cuando falta cualquiera de las dos tasas: quien consume tiene
 * que poder distinguir "no hay brecha que mostrar" de "la brecha es cero".
 */
export function calcularBrecha(oficial: number | null, paralelo: number | null): number | null {
  if (oficial === null || paralelo === null) return null;
  if (!Number.isFinite(oficial) || !Number.isFinite(paralelo) || oficial === 0) return null;

  return (paralelo / oficial - 1) * 100;
}

/**
 * La brecha de hoy, leyendo del snapshot las dos claves que le corresponden.
 *
 * Existe para que quien la muestra no tenga que saber cuáles son: el día que
 * cambie el lado del mercado con el que se mide, cambia aquí y no en cada
 * pantalla que la enseña.
 */
export function brechaDelSnapshot(snapshot: RatesSnapshot): number | null {
  return calcularBrecha(snapshot.rates.USD_BCV.bsPerUnit, snapshot.rates.USD_BINANCE_SELL.bsPerUnit);
}
