import { convert } from "@/lib/convert";
import { rateMeta } from "@/lib/rates";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Las páginas de conversión que se indexan: `/convertir/100-dolares-a-bolivares`
 * y sus hermanas.
 *
 * La app entera vivía de dos páginas indexables —la portada y `/historial`—
 * mientras la pregunta que la gente escribe de verdad en un buscador es
 * "cuánto son 100 dólares en bolívares hoy". Ese visitante es el más valioso
 * que puede llegar aquí, porque llega con el monto ya decidido, y hasta ahora
 * se lo llevaba otro.
 *
 * Tres decisiones que sostienen el resto:
 *
 * - **El slug nombra monedas, no tasas.** Nadie busca "dólar BCV a bolívares";
 *   busca "dólares a bolívares". Así que la URL habla el idioma del lector y
 *   es la página la que abre el abanico de tasas, que es exactamente lo que la
 *   portada ya hace con las tarjetas: una moneda puede tener más de un precio
 *   y esconderlo daría una imagen falsa del mercado.
 * - **Nada se calcula aquí.** Cada fila sale de `convert()` sobre el mismo
 *   snapshot que ve la calculadora, así que estas páginas no pueden decir un
 *   número distinto del que da la app. Es la misma regla que ya obliga a
 *   `lib/pesos.ts` a ser común a la imagen y al caption.
 * - **Los cruces dólar↔peso van emparejados por mercado**, no todos contra
 *   todos. Tres tasas de dólar por dos de peso son seis filas que nadie lee, y
 *   además mezclarlas produce cruces sin sentido —el dólar oficial contra el
 *   peso de Binance no es una operación que exista—. Se emparejan como ya lo
 *   hace la diapositiva de pesos del post diario: lo oficial con lo oficial y
 *   lo de mercado con lo de mercado.
 */

/** Las cuatro monedas que el lector nombra, con el slug con el que las escribe. */
export type MonedaSeo = "dolares" | "euros" | "pesos" | "bolivares";

interface DatosMoneda {
  /** Cómo se nombra en singular, para los títulos de monto 1. */
  singular: string;
  /** Cómo se nombra en plural. */
  plural: string;
  /** La clave con la que se formatea un monto de esta moneda. */
  formato: RateKey;
}

const MONEDAS: Record<MonedaSeo, DatosMoneda> = {
  dolares: { singular: "dólar", plural: "dólares", formato: "USD_BCV" },
  euros: { singular: "euro", plural: "euros", formato: "EUR_BCV" },
  pesos: { singular: "peso colombiano", plural: "pesos colombianos", formato: "COP_OFICIAL" },
  bolivares: { singular: "bolívar", plural: "bolívares", formato: "VES" },
};

/**
 * Los pares que se publican, con las tasas concretas de cada uno.
 *
 * No es el producto cartesiano de las monedas: euro↔peso se deja fuera porque
 * no es una operación que ocurra en esta frontera —quien tiene euros los cambia
 * a bolívares— y una página que nadie busca es una página que diluye las que sí.
 */
const COMBOS: Partial<Record<`${MonedaSeo}-${MonedaSeo}`, [RateKey, RateKey][]>> = {
  "dolares-bolivares": [
    ["USD_BCV", "VES"],
    ["USD_BINANCE_BUY", "VES"],
    ["USD_BINANCE_SELL", "VES"],
  ],
  "bolivares-dolares": [
    ["VES", "USD_BCV"],
    ["VES", "USD_BINANCE_BUY"],
    ["VES", "USD_BINANCE_SELL"],
  ],
  "euros-bolivares": [["EUR_BCV", "VES"]],
  "bolivares-euros": [["VES", "EUR_BCV"]],
  "pesos-bolivares": [
    ["COP_OFICIAL", "VES"],
    ["COP_FRONTERA", "VES"],
  ],
  "bolivares-pesos": [
    ["VES", "COP_OFICIAL"],
    ["VES", "COP_FRONTERA"],
  ],
  // Emparejados por mercado, ver la cabecera del módulo.
  "dolares-pesos": [
    ["USD_BCV", "COP_OFICIAL"],
    ["USD_BINANCE_BUY", "COP_FRONTERA"],
    ["USD_BINANCE_SELL", "COP_FRONTERA"],
  ],
  "pesos-dolares": [
    ["COP_OFICIAL", "USD_BCV"],
    ["COP_FRONTERA", "USD_BINANCE_BUY"],
    ["COP_FRONTERA", "USD_BINANCE_SELL"],
  ],
};

/**
 * Los montos que se generan.
 *
 * Son los que se escriben en un buscador: cifras redondas. No tiene sentido
 * publicar `137-dolares-a-bolivares` —nadie lo busca y para eso está la
 * calculadora, que es a donde estas páginas mandan—. Con nueve montos y ocho
 * pares salen 72 páginas, que es un mapa del sitio que se lee entero.
 */
export const MONTOS = [1, 5, 10, 20, 50, 100, 200, 500, 1000] as const;

export interface Conversion {
  monto: number;
  origen: MonedaSeo;
  destino: MonedaSeo;
}

/** El slug tal y como va en la URL: `100-dolares-a-bolivares`. */
export function slugDe({ monto, origen, destino }: Conversion): string {
  return `${monto}-${origen}-a-${destino}`;
}

const ES_MONEDA = (valor: string): valor is MonedaSeo => valor in MONEDAS;

/**
 * Lee un slug de la URL y devuelve `null` si no es uno de los publicados.
 *
 * Se valida contra el conjunto cerrado y no con una expresión regular
 * permisiva: la lista de páginas es finita y conocida, así que cualquier otra
 * cosa es un 404 y no una página generada al vuelo. Sin eso, `/convertir/` se
 * convertiría en una fábrica de páginas que alguien puede inventar desde fuera
 * —el mismo criterio por el que `normalizarEvento()` acota los tipos.
 */
export function parseSlug(slug: string): Conversion | null {
  const partes = slug.split("-a-");
  if (partes.length !== 2) return null;

  const [inicio, destino] = partes;
  const corte = inicio.indexOf("-");
  if (corte === -1) return null;

  const montoTexto = inicio.slice(0, corte);
  const monto = Number(montoTexto);
  const origen = inicio.slice(corte + 1);

  if (!ES_MONEDA(origen) || !ES_MONEDA(destino)) return null;
  if (!(MONTOS as readonly number[]).includes(monto)) return null;
  // `0100` y `100` valen lo mismo para `Number`, y serían dos URLs con el mismo
  // contenido. Solo se acepta la forma canónica, que es la que genera `slugDe`.
  if (String(monto) !== montoTexto) return null;
  if (!COMBOS[`${origen}-${destino}`]) return null;

  return { monto, origen, destino };
}

/** Todas las páginas que existen, para `generateStaticParams` y el sitemap. */
export function todasLasConversiones(): Conversion[] {
  const paginas: Conversion[] = [];
  for (const par of Object.keys(COMBOS) as `${MonedaSeo}-${MonedaSeo}`[]) {
    const [origen, destino] = par.split("-") as [MonedaSeo, MonedaSeo];
    for (const monto of MONTOS) paginas.push({ monto, origen, destino });
  }
  return paginas;
}

/** Cómo se nombra un monto de una moneda: "1 dólar", "100 dólares". */
export function nombreMonto(monto: number, moneda: MonedaSeo): string {
  const { singular, plural } = MONEDAS[moneda];
  return `${new Intl.NumberFormat("es-VE").format(monto)} ${monto === 1 ? singular : plural}`;
}

export function nombreMoneda(moneda: MonedaSeo, monto = 2): string {
  const { singular, plural } = MONEDAS[moneda];
  return monto === 1 ? singular : plural;
}

/** La clave con la que se formatea un monto de esa moneda (decimales incluidos). */
export function formatoDe(moneda: MonedaSeo): RateKey {
  return MONEDAS[moneda].formato;
}

export interface FilaConversion {
  /** La tasa de partida, p. ej. `USD_BCV`. */
  origen: RateKey;
  /** La tasa de llegada, p. ej. `VES`. */
  destino: RateKey;
  /** Nombre de la tasa de partida, p. ej. "Dólar BCV". */
  etiquetaOrigen: string;
  /** Nombre de la tasa de llegada. */
  etiquetaDestino: string;
  /** El resultado, o `null` si alguna de las dos tasas no está disponible. */
  valor: number | null;
  /** Cuántos bolívares vale una unidad de la tasa de partida. */
  tasaOrigen: number | null;
  /** Cuántos bolívares vale una unidad de la tasa de llegada. */
  tasaDestino: number | null;
}

/**
 * Las filas de una página, calculadas con `convert()` sobre el snapshot.
 *
 * Una fila con `valor: null` se muestra igual, diciendo que esa tasa no está
 * disponible ahora mismo: es el mismo criterio que las tarjetas de la portada
 * y el contrario a esconder la fila, que dejaría al lector creyendo que esa
 * tasa no existe.
 */
export function filasDe(conversion: Conversion, snapshot: RatesSnapshot): FilaConversion[] {
  const combos = COMBOS[`${conversion.origen}-${conversion.destino}`] ?? [];

  return combos.map(([origen, destino]) => ({
    origen,
    destino,
    etiquetaOrigen: rateMeta(origen).label,
    etiquetaDestino: rateMeta(destino).label,
    valor: convert(conversion.monto, origen, snapshot).results[destino],
    tasaOrigen: snapshot.rates[origen]?.bsPerUnit ?? null,
    tasaDestino: snapshot.rates[destino]?.bsPerUnit ?? null,
  }));
}

/**
 * La conversión inversa, si es una de las publicadas.
 *
 * Existe para poder enlazarla desde la página: quien busca "100 dólares en
 * bolívares" muchas veces quiere después la cuenta al revés, y además es la
 * clase de enlace interno que le dice a un buscador que estas páginas son un
 * conjunto y no setenta y dos islas.
 */
export function inversaDe({ monto, origen, destino }: Conversion): Conversion | null {
  return COMBOS[`${destino}-${origen}`] ? { monto, origen: destino, destino: origen } : null;
}

/** Los mismos dos lados con otros montos, para enlazar entre páginas hermanas. */
export function montosHermanos({ monto, origen, destino }: Conversion): Conversion[] {
  return MONTOS.filter((otro) => otro !== monto).map((otro) => ({ monto: otro, origen, destino }));
}
