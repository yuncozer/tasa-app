import { diaCaracasISO, formatPercent, formatRate, rangoSemana } from "@/lib/format";
import { desplazarDia, leerComparativa, type ClaveHistorico, type PuntoHistorico } from "@/lib/historico";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Las tres cifras del reporte semanal y cuánto se movió cada una.
 *
 * Vive aquí y no dentro de la ruta de la imagen por el mismo motivo que
 * `lib/pesos.ts`: lo consumen la imagen (`app/api/og/instagram-semanal`) y el
 * caption (`buildCaptionSemanal` en `lib/caption.ts`), y son el mismo post. Si
 * cada uno armara su lista, podrían acabar diciendo cosas distintas.
 */

export type FilaSemanalId = "USD_BCV" | "BRECHA" | "TRM";

/**
 * En qué se mide un cambio. No es un detalle de formato: una tasa varía en
 * porcentaje, pero la brecha ya *es* un porcentaje y su cambio se mide en
 * puntos porcentuales. Ver `calcularVariacion`.
 */
export type UnidadVariacion = "porcentaje" | "puntos";

export type DireccionVariacion = "sube" | "baja" | "igual" | "desconocida";

export interface FilaSemanal {
  id: FilaSemanalId;
  titulo: string;
  subtitulo: string;
  /**
   * El nombre con su artículo, para poder redactar una frase con él ("**El
   * dólar BCV** subió 1,4 % esta semana"). Va aparte de `titulo` porque ese es
   * una etiqueta de tarjeta y no encaja en medio de una oración.
   */
  sujeto: string;
  /** `null` si la fuente falló hoy. */
  valor: number | null;
  /** El valor ya formateado con su unidad, o "No disponible". */
  valorTexto: string;
  /** Magnitud del cambio, con signo. `null` si no hay dato de hace 7 días. */
  variacion: number | null;
  unidadVariacion: UnidadVariacion;
  direccion: DireccionVariacion;
}

export interface ReporteSemanal {
  filas: FilaSemanal[];
  /** Primer día de la semana que cubre el reporte ("YYYY-MM-DD" en Caracas). */
  desde: string;
  /** Último día, que es el de hoy. */
  hasta: string;
  rangoTexto: string;
  /** `true` mientras ninguna fila tenga con qué compararse. */
  sinComparacion: boolean;
}

/** Con menos de esto, el cambio se considera nulo y no se pinta flecha. */
const UMBRAL = 0.05;

const CLAVES: readonly ClaveHistorico[] = ["USD_BCV", "USD_BINANCE_SELL", "TRM"];

/**
 * Cuánto se paga de más fuera del BCV, en porcentaje.
 *
 * Se usa `USD_BINANCE_SELL` y **no** el `mid` de `BinanceDetail`: compra y
 * venta dejaron de promediarse a propósito porque la diferencia entre ambas es
 * real y esconderla da una imagen falsa del mercado (ver `CLAUDE.md`); `mid`
 * sobrevive solo porque `COP_FRONTERA` lo necesita para el cruce VES↔COP. Una
 * tarjeta que dice "brecha" tiene que nombrar un lado del mercado, y el que
 * responde a la pregunta del lector —cuánto pago de más— es la venta.
 */
function calcularBrecha(oficial: number | null, paralelo: number | null): number | null {
  if (oficial === null || paralelo === null) return null;
  if (!Number.isFinite(oficial) || !Number.isFinite(paralelo) || oficial === 0) return null;

  return (paralelo / oficial - 1) * 100;
}

/**
 * El cambio entre dos valores, en la unidad que corresponda.
 *
 * - `"porcentaje"`: cambio relativo, `(hoy / antes − 1) × 100`. Es lo que
 *   quiere decir "el dólar subió 1,4 %".
 * - `"puntos"`: resta directa, `hoy − antes`. Es lo único correcto cuando el
 *   valor ya es un porcentaje. Una brecha que pasa de 30,1 % a 34,2 % subió
 *   4,1 pp, que es literalmente lo que se lee en las dos cifras; decir que
 *   subió un 13,6 % sería un número que no aparece en ninguna parte de la
 *   tarjeta y que el lector confundiría con la brecha misma.
 */
function calcularVariacion(
  hoy: number | null,
  antes: number | undefined,
  unidad: UnidadVariacion,
): { variacion: number | null; direccion: DireccionVariacion } {
  if (hoy === null || antes === undefined || !Number.isFinite(antes)) {
    return { variacion: null, direccion: "desconocida" };
  }

  if (unidad === "porcentaje" && antes === 0) {
    return { variacion: null, direccion: "desconocida" };
  }

  const variacion = unidad === "porcentaje" ? (hoy / antes - 1) * 100 : hoy - antes;

  if (Math.abs(variacion) < UMBRAL) return { variacion: 0, direccion: "igual" };

  return { variacion, direccion: variacion > 0 ? "sube" : "baja" };
}

function valorDe(punto: PuntoHistorico | undefined): number | undefined {
  return punto?.valor;
}

/**
 * Arma el reporte de la semana que termina hoy.
 *
 * La comparación se pide contra `hoy − 7` y **no** contra `desde`: el reporte
 * cubre una semana inclusiva de siete días (de `hoy − 6` a hoy), pero lo que se
 * compara es hoy contra hace una semana exacta. Son cosas distintas por un día,
 * y confundirlas es el error obvio al leer este código.
 *
 * `comparativa` se recibe ya resuelta en vez de leerse aquí para que la use
 * también el camino sin Supabase (el script de vista previa, y la degradación
 * cuando la base falla).
 */
export function armarReporteSemanal(
  snapshot: RatesSnapshot,
  comparativa: Map<ClaveHistorico, PuntoHistorico>,
): ReporteSemanal {
  const hasta = diaCaracasISO(new Date(snapshot.fetchedAt).getTime());
  const desde = desplazarDia(hasta, -6);

  const bcvHoy = snapshot.rates.USD_BCV.bsPerUnit;
  const binanceHoy = snapshot.rates.USD_BINANCE_SELL.bsPerUnit;
  const trmHoy = snapshot.trm;

  const bcvAntes = valorDe(comparativa.get("USD_BCV"));
  const binanceAntes = valorDe(comparativa.get("USD_BINANCE_SELL"));
  const trmAntes = valorDe(comparativa.get("TRM"));

  const brechaHoy = calcularBrecha(bcvHoy, binanceHoy);
  // La brecha de la semana pasada se calcula con las mismas dos claves que la
  // de hoy: si falta cualquiera de las dos, no hay brecha anterior. No se
  // sustituye una por el `mid` ni por la de compra, porque entonces la
  // comparación sería entre dos cosas distintas.
  const brechaAntes =
    bcvAntes === undefined || binanceAntes === undefined
      ? undefined
      : (calcularBrecha(bcvAntes, binanceAntes) ?? undefined);

  const filas: FilaSemanal[] = [
    {
      id: "USD_BCV",
      titulo: "Dólar BCV",
      subtitulo: "Tasa oficial · Banco Central de Venezuela",
      sujeto: "El dólar BCV",
      valor: bcvHoy,
      valorTexto: bcvHoy === null ? "No disponible" : `${formatRate(bcvHoy)} Bs`,
      unidadVariacion: "porcentaje",
      ...calcularVariacion(bcvHoy, bcvAntes, "porcentaje"),
    },
    {
      id: "BRECHA",
      titulo: "Brecha BCV / Binance",
      subtitulo: "Diferencia entre tasa oficial y tasa P2P",
      sujeto: "La brecha entre el BCV y Binance",
      valor: brechaHoy,
      valorTexto: brechaHoy === null ? "No disponible" : formatPercent(brechaHoy),
      unidadVariacion: "puntos",
      ...calcularVariacion(brechaHoy, brechaAntes, "puntos"),
    },
    {
      id: "TRM",
      titulo: "TRM · Peso colombiano",
      subtitulo: "Peso frente al dólar · Banrep",
      sujeto: "La TRM del peso colombiano",
      // La TRM se toma tal cual la publica el Banco de la República, igual que
      // en `lib/pesos.ts`: derivarla de USD_BCV ÷ COP_OFICIAL daría lo mismo
      // por construcción pero con dos redondeos encima, sobre una cifra
      // oficial que el lector puede contrastar con la fuente.
      valor: trmHoy,
      valorTexto: trmHoy === null ? "No disponible" : `${formatRate(trmHoy)} COP`,
      unidadVariacion: "porcentaje",
      ...calcularVariacion(trmHoy, trmAntes, "porcentaje"),
    },
  ];

  return {
    filas,
    desde,
    hasta,
    rangoTexto: rangoSemana(desde, hasta),
    sinComparacion: filas.every((fila) => fila.variacion === null),
  };
}

/**
 * Lo mismo, leyendo el histórico de Supabase.
 *
 * Si la base falla —o si la tabla todavía no existe— el reporte sale igual, sin
 * comparaciones: los valores de hoy no dependen del histórico, así que la
 * imagen sigue siendo correcta y publicable. Es la misma degradación que ya
 * aplican `destinoDeHoy()` y la lectura de la cola de programadas.
 */
export async function construirReporteSemanal(snapshot: RatesSnapshot): Promise<ReporteSemanal> {
  const hasta = diaCaracasISO(new Date(snapshot.fetchedAt).getTime());

  let comparativa = new Map<ClaveHistorico, PuntoHistorico>();
  try {
    comparativa = await leerComparativa(CLAVES, desplazarDia(hasta, -7));
  } catch {
    // Sin histórico se publica el reporte sin variaciones, que es visible y
    // honesto, en vez de no publicar nada.
  }

  return armarReporteSemanal(snapshot, comparativa);
}
