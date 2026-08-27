/**
 * Histórico diario de tasas, sobre la tabla que crea
 * `supabase/migrations/0004_historico_tasas.sql`.
 *
 * Existe por una sola razón: el reporte semanal necesita el valor de hace siete
 * días, y hasta ahora la app solo conocía el presente.
 *
 * Se habla con PostgREST por `fetch`, sin `@supabase/supabase-js`, por el mismo
 * motivo que `lib/enlaces.ts` y `lib/programadas.ts`: son dos operaciones y el
 * proyecto ya resuelve así lo equivalente. Los helpers `credenciales()` y
 * `rest()` se repiten en los tres módulos; unificarlos es una refactorización
 * aparte, no algo que deba colarse en esta pieza.
 *
 * La `service_role` key salta el RLS, así que este módulo es **solo de
 * servidor**: nunca debe importarse desde un componente de cliente ni
 * exponerse con prefijo `NEXT_PUBLIC_`.
 */

import { calcularBrecha } from "@/lib/brecha";
import { diaCaracasISO } from "@/lib/format";
import type { RateKey, RatesSnapshot } from "@/lib/types";

const TIMEOUT_MS = 10_000;
const TABLA = "historico_tasas";

/** Cuántos días a cada lado del objetivo se aceptan si falta el día exacto. */
const VENTANA_DIAS = 3;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que se archiva: las bases de cotización, más la TRM.
 *
 * La TRM no es un `RateKey` —no es un precio en bolívares— pero es una de las
 * tres cifras del reporte semanal y se publica tal cual, así que se guarda con
 * su propia clave en vez de derivarla después de dos tasas redondeadas.
 */
export type ClaveHistorico = RateKey | "TRM";

/**
 * Los dos disparos diarios del cron de tasas (9:00 am y 6:00 pm en Caracas).
 * Viaja explícito desde la ruta que dispara el cron, igual que decide el
 * subtítulo del caption — no se adivina de la hora de escritura.
 */
export type Momento = "manana" | "tarde";

export interface PuntoHistorico {
  clave: ClaveHistorico;
  /** Día calendario en Caracas, "YYYY-MM-DD". */
  fecha: string;
  momento: Momento;
  valor: number;
}

interface FilaHistorico {
  fecha: string;
  momento: string;
  clave: string;
  valor: number | string;
}

function credenciales(): { base: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return { base: `${url.replace(/\/$/, "")}/rest/v1/${TABLA}`, key };
}

async function rest<T>(query: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { base, key } = credenciales();
  const { prefer, ...resto } = init;

  const response = await fetch(`${base}${query}`, {
    ...resto,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? "return=representation",
      ...resto.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase respondió ${response.status}: ${await response.text()}`);
  }

  const texto = await response.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/** Suma (o resta) días a una fecha "YYYY-MM-DD" sin tocar zonas horarias. */
export function desplazarDia(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const movido = new Date(Date.UTC(anio, mes - 1, dia) + dias * DIA_MS);
  return movido.toISOString().slice(0, 10);
}

/**
 * Anota el snapshot de este disparo del cron (mañana o tarde).
 *
 * Idempotente: la clave primaria `(fecha, momento, clave)` más
 * `resolution=merge-duplicates` hacen que reintentar el mismo disparo no
 * duplique la fila, pero mañana y tarde ya no se pisan entre sí — cada una
 * queda archivada por su cuenta.
 *
 * Las tasas que fallaron se saltan en vez de guardarse como cero o como hueco
 * explícito: una fuente caída no es un valor, y la ausencia de fila es lo que
 * `leerComparativa()` sabe interpretar.
 *
 * La fecha sale de `snapshot.fetchedAt` y no de `new Date()`: lo que se archiva
 * es la fecha del dato, no la del proceso que lo archiva.
 */
export async function registrarSnapshot(snapshot: RatesSnapshot, momento: Momento): Promise<void> {
  const fecha = diaCaracasISO(new Date(snapshot.fetchedAt).getTime());

  const filas: Array<{ fecha: string; momento: Momento; clave: ClaveHistorico; valor: number }> = [];

  for (const rate of Object.values(snapshot.rates)) {
    if (rate.bsPerUnit !== null && Number.isFinite(rate.bsPerUnit)) {
      filas.push({ fecha, momento, clave: rate.key, valor: rate.bsPerUnit });
    }
  }

  if (snapshot.trm !== null && Number.isFinite(snapshot.trm)) {
    filas.push({ fecha, momento, clave: "TRM", valor: snapshot.trm });
  }

  if (filas.length === 0) return;

  await rest<undefined>("", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(filas),
  });
}

/**
 * Las últimas lecturas de una clave, más recientes primero.
 *
 * Es la fuente del historial que consulta el usuario ("¿cómo estuvo el
 * Binance venta antier a las 6:00 pm?"): a diferencia de `leerComparativa()`,
 * que busca un solo punto cerca de una fecha objetivo para el reporte
 * semanal, aquí se listan filas tal cual quedaron archivadas, con su momento.
 *
 * `momento.desc` basta para ordenar tarde antes que mañana dentro del mismo
 * día porque "tarde" es alfabéticamente mayor que "manana" — no hace falta
 * `capturado_en`.
 */
/**
 * Qué disparos del día quedaron archivados: `["manana"]`, `["manana",
 * "tarde"]`, o vacío.
 *
 * `registrarSnapshot()` corre dentro de `publicarTasasDelDia()` y solo con
 * `momento` explícito, o sea únicamente desde el cron. Por eso la presencia
 * de filas de un momento es el rastro más fiable de que **ese** disparo llegó
 * a publicar: es la misma escritura que acompaña al post, no un registro
 * aparte que pudiera desincronizarse.
 *
 * Se pide una sola clave (`USD_BCV`) en vez de todas: basta una para saber si
 * el disparo ocurrió, y traer las siete multiplicaría por siete unas filas
 * que solo se van a contar.
 */
export async function momentosArchivados(fecha: string): Promise<Momento[]> {
  const filas = await rest<{ momento: string }[]>(
    `?fecha=eq.${fecha}&clave=eq.USD_BCV&select=momento`,
  );
  return filas
    .map((fila) => fila.momento)
    .filter((momento): momento is Momento => momento === "manana" || momento === "tarde");
}

export async function listarHistorico(clave: ClaveHistorico, limite: number = 60): Promise<PuntoHistorico[]> {
  const filas = await rest<FilaHistorico[]>(
    `?clave=eq.${encodeURIComponent(clave)}` +
      "&select=clave,fecha,momento,valor" +
      "&order=fecha.desc,momento.desc" +
      `&limit=${limite}`,
    { method: "GET" },
  );

  const puntos: PuntoHistorico[] = [];
  for (const fila of filas) {
    const valor = Number(fila.valor);
    if (!Number.isFinite(valor)) continue;
    if (fila.momento !== "manana" && fila.momento !== "tarde") continue;

    puntos.push({ clave: fila.clave as ClaveHistorico, fecha: fila.fecha, momento: fila.momento, valor });
  }

  return puntos;
}

/**
 * Las claves que hacen falta para reconstruir las cuatro filas del post en
 * pesos (`lib/pesos.ts`) en un momento pasado: la TRM se archiva tal cual, y
 * las tres filas de frontera cruzan por `COP_FRONTERA` igual que
 * `buildFilasPesos()`. `VES` no hace falta pedirla: su `bsPerUnit` es siempre
 * 1 por construcción (`buildRate("VES", 1, ...)` en `lib/rates.ts`), así que
 * el bolívar promedio se simplifica a `1 ÷ COP_FRONTERA` sin archivar nada
 * aparte — el mismo atajo que ya usa `buildFilasPesos()` para el snapshot de
 * hoy.
 */
const CLAVES_PESOS: readonly ClaveHistorico[] = ["TRM", "USD_BINANCE_BUY", "USD_BINANCE_SELL", "COP_FRONTERA"];

export interface FilaHistoricoPesos {
  fecha: string;
  momento: Momento;
  /** Cuántos pesos vale cada cosa, o `null` si ese día faltó algún dato. */
  trm: number | null;
  fronteraBuy: number | null;
  fronteraSell: number | null;
  vesPromedio: number | null;
}

/**
 * Las últimas lecturas archivadas, vistas como el post en pesos: una fila por
 * `(fecha, momento)` con las cuatro cifras juntas, igual que se publican.
 *
 * Se piden las cuatro claves en un solo viaje y se agrupan aquí en vez de
 * hacer cuatro llamadas a `listarHistorico()`, una por clave, que además
 * podrían traer ventanas de fechas distintas si algún día faltó un dato.
 *
 * El orden de llegada de PostgREST (`fecha.desc,momento.desc`) es el mismo
 * orden en que hay que mostrar los grupos, y un `Map` conserva el orden de
 * inserción: no hace falta reordenar después de agrupar.
 */
export async function listarHistoricoPesos(limite: number = 30): Promise<FilaHistoricoPesos[]> {
  const filas = await rest<FilaHistorico[]>(
    `?clave=in.(${CLAVES_PESOS.map(encodeURIComponent).join(",")})` +
      "&select=clave,fecha,momento,valor" +
      "&order=fecha.desc,momento.desc" +
      `&limit=${limite * CLAVES_PESOS.length}`,
    { method: "GET" },
  );

  const grupos = new Map<string, { fecha: string; momento: Momento; valores: Partial<Record<ClaveHistorico, number>> }>();

  for (const fila of filas) {
    if (fila.momento !== "manana" && fila.momento !== "tarde") continue;

    const valor = Number(fila.valor);
    if (!Number.isFinite(valor)) continue;

    const clave = fila.clave as ClaveHistorico;
    const llave = `${fila.fecha}_${fila.momento}`;
    const grupo = grupos.get(llave) ?? { fecha: fila.fecha, momento: fila.momento, valores: {} };
    grupo.valores[clave] = valor;
    grupos.set(llave, grupo);
  }

  const resultado: FilaHistoricoPesos[] = [];
  for (const { fecha, momento, valores } of grupos.values()) {
    const cop_frontera = valores.COP_FRONTERA;
    resultado.push({
      fecha,
      momento,
      trm: valores.TRM ?? null,
      fronteraBuy: cop_frontera && valores.USD_BINANCE_BUY ? valores.USD_BINANCE_BUY / cop_frontera : null,
      fronteraSell: cop_frontera && valores.USD_BINANCE_SELL ? valores.USD_BINANCE_SELL / cop_frontera : null,
      vesPromedio: cop_frontera ? 1 / cop_frontera : null,
    });

    if (resultado.length >= limite) break;
  }

  return resultado;
}

/**
 * Las claves que hacen falta para reconstruir la brecha BCV/Binance
 * (`calcularBrecha()` en `lib/brecha.ts`) en un momento pasado: la misma
 * venta de Binance con la que se mide en la portada y en el reporte semanal,
 * nunca el `mid`.
 */
const CLAVES_BRECHA: readonly ClaveHistorico[] = ["USD_BCV", "USD_BINANCE_SELL"];

export interface FilaHistoricoBrecha {
  fecha: string;
  momento: Momento;
  /** `null` cuando falta cualquiera de las dos tasas ese momento — nunca 0. */
  brecha: number | null;
}

/**
 * Las últimas lecturas archivadas, vistas como la brecha entre el dólar BCV y
 * la venta de Binance — la misma cuenta que `brechaDelSnapshot()`, pero sobre
 * lo ya archivado en vez del snapshot de hoy.
 *
 * Mismo patrón que `listarHistoricoPesos()`: se piden las dos claves en un
 * solo viaje y se agrupan por `(fecha, momento)` en vez de dos llamadas a
 * `listarHistorico()` que podrían traer ventanas de fechas distintas.
 */
export async function listarHistoricoBrecha(limite: number = 60): Promise<FilaHistoricoBrecha[]> {
  const filas = await rest<FilaHistorico[]>(
    `?clave=in.(${CLAVES_BRECHA.map(encodeURIComponent).join(",")})` +
      "&select=clave,fecha,momento,valor" +
      "&order=fecha.desc,momento.desc" +
      `&limit=${limite * CLAVES_BRECHA.length}`,
    { method: "GET" },
  );

  const grupos = new Map<string, { fecha: string; momento: Momento; valores: Partial<Record<ClaveHistorico, number>> }>();

  for (const fila of filas) {
    if (fila.momento !== "manana" && fila.momento !== "tarde") continue;

    const valor = Number(fila.valor);
    if (!Number.isFinite(valor)) continue;

    const clave = fila.clave as ClaveHistorico;
    const llave = `${fila.fecha}_${fila.momento}`;
    const grupo = grupos.get(llave) ?? { fecha: fila.fecha, momento: fila.momento, valores: {} };
    grupo.valores[clave] = valor;
    grupos.set(llave, grupo);
  }

  const resultado: FilaHistoricoBrecha[] = [];
  for (const { fecha, momento, valores } of grupos.values()) {
    resultado.push({
      fecha,
      momento,
      brecha: calcularBrecha(valores.USD_BCV ?? null, valores.USD_BINANCE_SELL ?? null),
    });

    if (resultado.length >= limite) break;
  }

  return resultado;
}

/**
 * El valor de cada clave lo más cerca posible de `fechaObjetivo`, en un solo
 * viaje a Supabase.
 *
 * Se pide una ventana de días alrededor del objetivo, no el día exacto, porque
 * el cron puede haber fallado esa jornada. La ventana es **simétrica**: si el
 * lunes pasado no se registró nada pero el martes sí, ese dato sirve igual y
 * está más cerca que el del viernes anterior.
 *
 * En caso de empate entre dos días distintos gana la fecha **más antigua**,
 * para que la comparación no se acorte por debajo de la semana que promete el
 * reporte. Dentro del mismo día, entre mañana y tarde, gana la **tarde**: es
 * el dato que mejor representa cómo cerró esa jornada.
 *
 * Cuando no hay dato para una clave, esa clave sencillamente no aparece en el
 * `Map`. No se devuelve un `valor: null` ni ningún centinela: quien consume
 * tiene que poder distinguir "no hay comparación" de "el valor era cero" sin
 * ambigüedad.
 */
export async function leerComparativa(
  claves: readonly ClaveHistorico[],
  fechaObjetivo: string,
  ventanaDias: number = VENTANA_DIAS,
): Promise<Map<ClaveHistorico, PuntoHistorico>> {
  const resultado = new Map<ClaveHistorico, PuntoHistorico>();
  if (claves.length === 0) return resultado;

  const desde = desplazarDia(fechaObjetivo, -ventanaDias);
  const hasta = desplazarDia(fechaObjetivo, ventanaDias);

  const filas = await rest<FilaHistorico[]>(
    `?clave=in.(${claves.map(encodeURIComponent).join(",")})` +
      `&fecha=gte.${desde}&fecha=lte.${hasta}` +
      "&select=clave,fecha,momento,valor",
    { method: "GET" },
  );

  const objetivoMs = Date.parse(`${fechaObjetivo}T00:00:00Z`);
  const permitidas = new Set<string>(claves);

  for (const fila of filas) {
    if (!permitidas.has(fila.clave)) continue;
    if (fila.momento !== "manana" && fila.momento !== "tarde") continue;

    // PostgREST devuelve `numeric` como cadena para no perder precisión.
    const valor = Number(fila.valor);
    if (!Number.isFinite(valor)) continue;

    const clave = fila.clave as ClaveHistorico;
    const actual = resultado.get(clave);
    const distancia = Math.abs(Date.parse(`${fila.fecha}T00:00:00Z`) - objetivoMs);

    if (actual) {
      const distanciaActual = Math.abs(Date.parse(`${actual.fecha}T00:00:00Z`) - objetivoMs);
      if (distancia > distanciaActual) continue;
      if (distancia === distanciaActual) {
        if (fila.fecha !== actual.fecha) {
          // Empate entre días distintos: se queda el más antiguo.
          if (fila.fecha >= actual.fecha) continue;
        } else if (!(fila.momento === "tarde" && actual.momento === "manana")) {
          // Mismo día: solo la tarde reemplaza a la mañana.
          continue;
        }
      }
    }

    resultado.set(clave, { clave, fecha: fila.fecha, momento: fila.momento, valor });
  }

  return resultado;
}
