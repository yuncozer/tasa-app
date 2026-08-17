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

export interface PuntoHistorico {
  clave: ClaveHistorico;
  /** Día calendario en Caracas, "YYYY-MM-DD". */
  fecha: string;
  valor: number;
}

interface FilaHistorico {
  fecha: string;
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
 * Anota el snapshot del día.
 *
 * Idempotente: la clave primaria `(fecha, clave)` más
 * `resolution=merge-duplicates` hacen que el segundo disparo del día pise al
 * primero, así que lo que queda es el último dato conocido de la jornada.
 *
 * Las tasas que fallaron se saltan en vez de guardarse como cero o como hueco
 * explícito: una fuente caída no es un valor, y la ausencia de fila es lo que
 * `leerComparativa()` sabe interpretar.
 *
 * La fecha sale de `snapshot.fetchedAt` y no de `new Date()`: lo que se archiva
 * es la fecha del dato, no la del proceso que lo archiva.
 */
export async function registrarSnapshot(snapshot: RatesSnapshot): Promise<void> {
  const fecha = diaCaracasISO(new Date(snapshot.fetchedAt).getTime());

  const filas: Array<{ fecha: string; clave: ClaveHistorico; valor: number }> = [];

  for (const rate of Object.values(snapshot.rates)) {
    if (rate.bsPerUnit !== null && Number.isFinite(rate.bsPerUnit)) {
      filas.push({ fecha, clave: rate.key, valor: rate.bsPerUnit });
    }
  }

  if (snapshot.trm !== null && Number.isFinite(snapshot.trm)) {
    filas.push({ fecha, clave: "TRM", valor: snapshot.trm });
  }

  if (filas.length === 0) return;

  await rest<undefined>("", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(filas),
  });
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
 * En caso de empate gana la fecha **más antigua**, para que la comparación no
 * se acorte por debajo de la semana que promete el reporte.
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
      "&select=clave,fecha,valor",
    { method: "GET" },
  );

  const objetivoMs = Date.parse(`${fechaObjetivo}T00:00:00Z`);
  const permitidas = new Set<string>(claves);

  for (const fila of filas) {
    if (!permitidas.has(fila.clave)) continue;

    // PostgREST devuelve `numeric` como cadena para no perder precisión.
    const valor = Number(fila.valor);
    if (!Number.isFinite(valor)) continue;

    const clave = fila.clave as ClaveHistorico;
    const actual = resultado.get(clave);
    const distancia = Math.abs(Date.parse(`${fila.fecha}T00:00:00Z`) - objetivoMs);

    if (actual) {
      const distanciaActual = Math.abs(Date.parse(`${actual.fecha}T00:00:00Z`) - objetivoMs);
      if (distancia > distanciaActual) continue;
      // Empate: se queda la más antigua.
      if (distancia === distanciaActual && fila.fecha >= actual.fecha) continue;
    }

    resultado.set(clave, { clave, fecha: fila.fecha, valor });
  }

  return resultado;
}
