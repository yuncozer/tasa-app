import { diaCaracasISO } from "@/lib/format";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Cola de "el cron de tasas quiso publicar, pero faltaba una tasa base", sobre
 * la tabla que crea `supabase/migrations/0009_tasas_pendientes.sql`.
 *
 * Mismo patrón de acceso que `lib/programadas.ts`: `fetch` directo a
 * PostgREST con `SUPABASE_SERVICE_ROLE_KEY`, sin el SDK. Solo servidor: la
 * `service_role` salta el RLS.
 */

const TIMEOUT_MS = 10_000;
const TABLA = "tasas_pendientes";
const CANDIDATAS = 3;

/**
 * Las cuatro tasas que de verdad publica una fuente (BCV, Binance): sin
 * cualquiera de ellas el post y las Historias del día no salen. Las demás
 * claves (`COP_FRONTERA`, `COP_OFICIAL`, `VES`) son cruces derivados de estas
 * y de la TRM, no algo que una fuente pueda dejar "a medias".
 */
const TASAS_BASE: RateKey[] = ["USD_BCV", "EUR_BCV", "USD_BINANCE_BUY", "USD_BINANCE_SELL"];

/** `true` si las cuatro tasas base tienen precio. */
export function tasasBaseCompletas(snapshot: RatesSnapshot): boolean {
  return TASAS_BASE.every((key) => snapshot.rates[key].bsPerUnit !== null);
}

export type EstadoTasaPendiente = "pendiente" | "publicada" | "abandonada";
export type Momento = "manana" | "tarde";

export interface TasaPendiente {
  id: string;
  fecha: string;
  momento: Momento;
  estado: EstadoTasaPendiente;
  intentos: number;
  arrancada_en: string | null;
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

/**
 * Dice "sigo esperando las tasas de este momento" y deja en cola cualquier
 * otra fila que hubiera quedado pendiente — un `manana` que nunca se resolvió
 * no debe seguir reintentándose una vez ya se está esperando el `tarde`.
 *
 * `on conflict do nothing` es la idempotencia: si el cron de las 9:00 se
 * dispara dos veces (cron-job.org duplicado, prueba manual), la segunda
 * llamada no crea una segunda fila para el mismo `(fecha, momento)`.
 */
export async function registrarPendiente(fecha: string, momento: Momento): Promise<void> {
  await rest<void>("?on_conflict=fecha,momento", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({ fecha, momento, estado: "pendiente" }),
  });

  // Todo lo demás que siguiera "pendiente" ya no aplica: o es un momento
  // distinto de un disparo anterior, o es este mismo momento de un día
  // anterior que por lo que sea nunca se resolvió.
  await rest<void>(`?estado=eq.pendiente&or=(fecha.neq.${fecha},momento.neq.${momento})`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ estado: "abandonada", arrancada_en: null, actualizada_en: new Date().toISOString() }),
  });
}

const ABANDONADA_MS = 60_000;

/**
 * Toma la fila pendiente más antigua de forma atómica, igual criterio que
 * `reclamarVencida()` en `lib/programadas.ts`: el `estado=eq.pendiente` del
 * filtro viaja al `WHERE` del `UPDATE`, así que si dos disparos del cron se
 * solapan, solo uno se lleva la fila.
 */
/**
 * La fila que sigue esperando, si la hay. Solo lectura: no reclama nada, así
 * que la agenda de `/admin` puede consultarla sin competir con el cron que
 * reintenta cada dos minutos.
 */
export async function pendienteActual(): Promise<TasaPendiente | null> {
  const filas = await rest<TasaPendiente[]>(
    "?estado=eq.pendiente&order=creada_en.desc&limit=1",
    { method: "GET" },
  );
  return filas[0] ?? null;
}

export async function reclamarPendiente(): Promise<TasaPendiente | null> {
  const limite = new Date(Date.now() - ABANDONADA_MS).toISOString();
  const candidatas = await rest<TasaPendiente[]>(
    `?estado=eq.pendiente&order=creada_en.asc&limit=${CANDIDATAS}`,
    { method: "GET" },
  );

  for (const candidata of candidatas) {
    const filas = await rest<TasaPendiente[]>(
      `?id=eq.${encodeURIComponent(candidata.id)}&estado=eq.pendiente` +
        `&or=(arrancada_en.is.null,arrancada_en.lt.${limite})`,
      {
        method: "PATCH",
        body: JSON.stringify({
          intentos: candidata.intentos + 1,
          arrancada_en: new Date().toISOString(),
          actualizada_en: new Date().toISOString(),
        }),
      },
    );
    if (filas[0]) return filas[0];
  }

  return null;
}

/** Las tasas seguían incompletas: suelta la fila para que el disparo de dentro de 2 minutos la retome. */
export async function liberarPendiente(id: string): Promise<void> {
  await rest<void>(`?id=eq.${encodeURIComponent(id)}&estado=eq.pendiente`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ arrancada_en: null, actualizada_en: new Date().toISOString() }),
  });
}

/** Ya se publicó con las cuatro tasas completas. */
export async function marcarPublicada(id: string): Promise<void> {
  await rest<void>(`?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ estado: "publicada", arrancada_en: null, actualizada_en: new Date().toISOString() }),
  });
}

/** La fecha de hoy en Caracas, como la espera la columna `fecha` de esta tabla. */
export function fechaDeHoy(): string {
  return diaCaracasISO(Date.now());
}
