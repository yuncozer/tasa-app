/**
 * La otra mitad de la puerta que decide si el post del día puede salir.
 *
 * `tasasBaseCompletas()` cubre el caso de que **falte** una tasa. Este módulo
 * cubre el contrario: una tasa que está presente pero es absurda. Un dólar
 * Binance que salta un 40 % entre una lectura y la siguiente casi nunca es
 * mercado —es un anuncio raro, un cambio de formato en la fuente o un
 * scrapeo que leyó otra cosa— y publicarlo lo convierte en una imagen con la
 * marca de La Tasa afirmando un número que no existe. Eso no se corrige
 * después: el post ya salió.
 *
 * La comparación se hace contra la **última lectura archivada** en
 * `historico_tasas`, que es la que ya se publicó y que el lector tiene
 * delante. No inventa una referencia propia ni consulta a nadie más.
 *
 * Tres cautelas para que esto no bloquee una devaluación real, que en esta
 * frontera sí ocurre:
 *
 * - **El umbral es alto** (30 %). No pretende detectar un movimiento fuerte
 *   —eso es noticia y hay que publicarlo— sino un valor imposible.
 * - **Con la referencia vieja no se opina.** Si la última lectura archivada
 *   tiene más de `VENTANA_DIAS` días, no hay con qué comparar y se deja
 *   pasar: es la misma regla de "sin dato no se inventa un dato" que rige el
 *   resto del proyecto.
 * - **No bloquea en silencio ni para siempre.** Quien llama deja la fila en
 *   `tasas_pendientes` y avisa por correo; si el valor era basura, la lectura
 *   siguiente ya publica sola, y si era real, el admin publica a mano desde
 *   `/admin/hoy`, que es el botón que siempre publica con lo que haya.
 */

import { diaCaracasISO } from "@/lib/format";
import { desplazarDia, listarHistorico } from "@/lib/historico";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/** Las mismas cuatro que gatea `tasasBaseCompletas()`. */
const TASAS_BASE: RateKey[] = ["USD_BCV", "EUR_BCV", "USD_BINANCE_BUY", "USD_BINANCE_SELL"];

/**
 * Cuánto puede moverse una tasa respecto de la última lectura publicada antes
 * de que deje de parecer mercado. El BCV se mueve en torno al 1 % diario y
 * Binance algunos puntos; un 30 % en medio día no se ha visto sin que sea un
 * fallo de la fuente.
 */
const UMBRAL = 0.3;

/** Más allá de esto, la referencia ya no describe el presente. */
const VENTANA_DIAS = 4;

export interface AnomaliaTasa {
  clave: RateKey;
  etiqueta: string;
  valor: number;
  referencia: number;
  /** Cuánto se movió, en tanto por uno y con signo. */
  variacion: number;
}

async function ultimaLectura(clave: RateKey, minima: string): Promise<number | null> {
  const puntos = await listarHistorico(clave, 1);
  const punto = puntos[0];
  if (!punto || punto.fecha < minima) return null;
  return punto.valor;
}

/**
 * La tasa que se movió demasiado, o `null` si todas son creíbles.
 *
 * Devuelve **una sola** —la que más se movió— porque el aviso que se manda
 * con esto es una frase, no un informe: con saber cuál disparó la alarma y
 * cuánto, ya se puede ir a mirarla.
 *
 * Nunca lanza: si el histórico no responde, no hay con qué comparar y se
 * deja pasar. Esta puerta existe para atrapar un dato imposible, no para
 * añadir un motivo nuevo por el que el post no salga.
 */
export async function revisarCordura(snapshot: RatesSnapshot): Promise<AnomaliaTasa | null> {
  try {
    const minima = desplazarDia(diaCaracasISO(Date.now()), -VENTANA_DIAS);

    const anomalias: AnomaliaTasa[] = [];

    await Promise.all(
      TASAS_BASE.map(async (clave) => {
        const valor = snapshot.rates[clave].bsPerUnit;
        if (valor === null) return;

        const referencia = await ultimaLectura(clave, minima);
        if (referencia === null || referencia === 0) return;

        const variacion = (valor - referencia) / referencia;
        if (Math.abs(variacion) > UMBRAL) {
          anomalias.push({
            clave,
            etiqueta: snapshot.rates[clave].label,
            valor,
            referencia,
            variacion,
          });
        }
      }),
    );

    if (anomalias.length === 0) return null;

    return anomalias.reduce((peor, actual) =>
      Math.abs(actual.variacion) > Math.abs(peor.variacion) ? actual : peor,
    );
  } catch {
    return null;
  }
}
