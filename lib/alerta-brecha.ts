import { brechaDelSnapshot, calcularBrecha } from "@/lib/brecha";
import { diaCaracasISO, formatPercent, formatRate } from "@/lib/format";
import { desplazarDia, leerComparativa, type ClaveHistorico, type PuntoHistorico } from "@/lib/historico";
import type { RatesSnapshot } from "@/lib/types";
import type { DireccionVariacion } from "@/lib/semanal";

/**
 * La alerta de brecha: un post suelto —"se abrió la brecha"— que se dispara a
 * mano desde `/admin/brecha` cuando el admin ve que la distancia entre el BCV
 * y Binance se movió lo bastante como para contarlo.
 *
 * No calcula la brecha por su cuenta: la pide a `calcularBrecha()`
 * (`lib/brecha.ts`), la misma que enseña la portada y publica el reporte
 * semanal. Es la regla de siempre —una sola cuenta por cifra— y aquí pesa el
 * doble: este post existe precisamente para llamar la atención sobre ese
 * número, y sería el peor sitio para que dijera algo distinto de lo que la
 * gente lleva todo el día viendo en pantalla.
 *
 * La comparación contra hace una semana sale del mismo histórico y con la
 * misma ventana que el reporte semanal (`leerComparativa`, ±3 días), por el
 * mismo motivo: si el cron falló un día, el dato del vecino sirve y está más
 * cerca que el de la semana anterior.
 *
 * **No se puede programar.** Como el semanal, sus cifras se resuelven al
 * publicar; además una alerta programada es una contradicción: se publica
 * porque la brecha se movió *ahora*.
 */

/** Las dos claves con las que se mide la brecha. Son las de `brechaDelSnapshot`. */
const CLAVES: readonly ClaveHistorico[] = ["USD_BCV", "USD_BINANCE_SELL"];

/** Con menos de esto no hay movimiento que anunciar. Mismo umbral que el semanal. */
const UMBRAL = 0.05;

export interface AlertaBrecha {
  /** La brecha de hoy, en porcentaje. `null` si falta alguna de las dos tasas. */
  brecha: number | null;
  brechaTexto: string;
  /** La de hace una semana, si el histórico la tiene. */
  brechaAntes: number | null;
  brechaAntesTexto: string;
  /** Cuánto se movió, en **puntos porcentuales**: la brecha ya es un porcentaje. */
  variacion: number | null;
  direccion: DireccionVariacion;
  /** El titular de la imagen, que cambia con la dirección: no siempre "se abrió". */
  titular: string;
  /** El USDT de Binance (venta) de hoy, en bolívares, ya formateado. */
  valorParaleloTexto: string;
  /** El dólar BCV de hoy, para el caption: la brecha se mide contra él. */
  valorOficialTexto: string;
  /** Instante en que se capturaron las tasas. Lo que fecha la pieza. */
  capturadoEn: string;
  /**
   * Si esta alerta se pidió **con** comparación. No es lo mismo que tenerla:
   * `false` significa que el admin eligió publicar solo la brecha de hoy, y
   * `true` con `direccion: "desconocida"` que la pidió pero el histórico no
   * tenía el dato. La imagen se ve igual en los dos casos —la comparación no
   * está—, pero el caption no puede decir lo mismo: hablar de un dato que
   * falta cuando nadie lo pidió sería inventarle un problema al lector.
   */
  comparada: boolean;
  /**
   * Si hay algo que publicar. Sin brecha no hay post: a diferencia de la
   * portada o del semanal, que muestran un estado, esto es una pieza cuyo
   * único contenido *es* esa cifra, y un "Sin dato" enorme no es una alerta.
   */
  publicable: boolean;
}

function direccionDe(variacion: number | null): DireccionVariacion {
  if (variacion === null) return "desconocida";
  if (Math.abs(variacion) < UMBRAL) return "igual";
  return variacion > 0 ? "sube" : "baja";
}

/**
 * El titular no se escribe a mano en la interfaz: lo decide la dirección.
 *
 * La pieza nació para anunciar que la brecha creció, pero publicarla con ese
 * texto un día en que se cerró sería el mismo daño que un promedio: la imagen
 * diciendo lo contrario de sus propias cifras, que están justo debajo.
 */
function titularDe(direccion: DireccionVariacion): string {
  if (direccion === "sube") return "AUMENTA LA BRECHA";
  if (direccion === "baja") return "BAJA LA BRECHA";
  if (direccion === "igual") return "LA BRECHA SE MANTIENE";
  return "ASÍ ESTÁ LA BRECHA";
}

/** Arma la alerta con la comparativa ya resuelta (la usa también el camino sin Supabase). */
export function armarAlertaBrecha(
  snapshot: RatesSnapshot,
  comparativa: Map<ClaveHistorico, PuntoHistorico>,
  comparada = true,
): AlertaBrecha {
  const brecha = brechaDelSnapshot(snapshot);

  const bcvAntes = comparativa.get("USD_BCV")?.valor;
  const binanceAntes = comparativa.get("USD_BINANCE_SELL")?.valor;
  // Los dos extremos se calculan con las mismas dos claves, igual que en el
  // semanal: si falta cualquiera, no hay brecha anterior con la que comparar.
  const brechaAntes =
    bcvAntes === undefined || binanceAntes === undefined ? null : calcularBrecha(bcvAntes, binanceAntes);

  const variacion = brecha === null || brechaAntes === null ? null : brecha - brechaAntes;
  const direccion = direccionDe(variacion);

  return {
    brecha,
    brechaTexto: formatPercent(brecha),
    brechaAntes,
    brechaAntesTexto: formatPercent(brechaAntes),
    variacion,
    direccion,
    titular: titularDe(direccion),
    valorParaleloTexto: `${formatRate(snapshot.rates.USD_BINANCE_SELL.bsPerUnit)} Bs`,
    valorOficialTexto: `${formatRate(snapshot.rates.USD_BCV.bsPerUnit)} Bs`,
    capturadoEn: snapshot.fetchedAt,
    comparada,
    publicable: brecha !== null,
  };
}

/**
 * Lo mismo, leyendo el histórico de Supabase.
 *
 * Si la base falla, la alerta sale igual pero sin comparación: la brecha de hoy
 * no depende del histórico. Misma degradación que `construirReporteSemanal()`.
 *
 * `comparar: false` es la elección del admin en `/admin/brecha`: publicar solo
 * la brecha de hoy, sin decir si subió o bajó. No es una variante degradada
 * sino una pieza distinta —hay días en que el movimiento no es la noticia y el
 * nivel sí—, y entonces ni se consulta el histórico: sería una lectura a
 * Supabase para un dato que no se va a mostrar.
 */
export async function construirAlertaBrecha(
  snapshot: RatesSnapshot,
  opciones?: { comparar?: boolean },
): Promise<AlertaBrecha> {
  const comparar = opciones?.comparar ?? true;
  if (!comparar) return armarAlertaBrecha(snapshot, new Map<ClaveHistorico, PuntoHistorico>(), false);

  const hoy = diaCaracasISO(new Date(snapshot.fetchedAt).getTime());

  let comparativa = new Map<ClaveHistorico, PuntoHistorico>();
  try {
    comparativa = await leerComparativa(CLAVES, desplazarDia(hoy, -7));
  } catch {
    // Sin histórico se publica la brecha de hoy sin el "hace una semana", que
    // es visible y honesto, en vez de no publicar nada.
  }

  return armarAlertaBrecha(snapshot, comparativa);
}
