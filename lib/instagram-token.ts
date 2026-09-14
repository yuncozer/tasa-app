/**
 * Custodia del token de Instagram: dónde vive, cuándo caduca y cómo se
 * renueva solo.
 *
 * El problema que resuelve es un fallo silencioso. El token de larga duración
 * vale 60 días; cuando expira, el cron de las 9:00 deja de publicar sin que
 * nada avise, y uno se entera mirando el feed. Y Meta **no expone ningún
 * endpoint que diga cuánto le queda** a un token de este flujo: la única vía
 * es `refresh_access_token`, que devuelve uno nuevo junto con su `expires_in`.
 * Es decir que vigilarlo obliga a guardarlo, y de ahí la tabla
 * `token_instagram` (migración `0012`).
 *
 * Tres reglas que hacen que esto no pueda romper lo que ya publica:
 *
 * - **El entorno sigue siendo la semilla y el respaldo.** Sin fila guardada
 *   —arranque en frío, o Supabase caído— se publica con `IG_ACCESS_TOKEN`,
 *   exactamente como antes de que este módulo existiera. Añade vigilancia,
 *   no un punto único de fallo.
 * - **La lectura va cacheada en memoria.** Publicar un carrusel son cuatro o
 *   más llamadas a la Graph API; sin caché serían otras tantas consultas a
 *   Supabase para leer la misma fila. Cinco minutos es el mismo TTL que usa
 *   `getRates()`, y un token que se refresca una vez al mes no necesita más
 *   frescura que eso.
 * - **Refrescar es idempotente y conservador.** El cron solo llama a Meta
 *   cuando quedan menos de `DIAS_PARA_REFRESCAR` días; Meta exige además que
 *   el token tenga al menos 24 horas, así que refrescar por cada disparo
 *   sería pedir errores sin ganar nada.
 *
 * Este módulo es **solo de servidor**: lee y escribe una credencial con la
 * `service_role` de Supabase.
 */

import { olvidar, withCache } from "@/lib/cache";
import { GRAPH_BASE } from "@/lib/instagram";

const TIMEOUT_MS = 10_000;
const TABLA = "token_instagram";
const CLAVE = "actual";
const CLAVE_CACHE = "token-instagram";
const DIA_MS = 24 * 60 * 60 * 1000;

/** Cuánto se reutiliza la fila leída antes de volver a preguntar a Supabase. */
const TTL_CACHE_MS = 5 * 60 * 1000;

/**
 * Cuántas veces se intenta leer la fila antes de darla por ilegible, y cuánto
 * se espera entre intentos.
 *
 * La puerta de enlace de Supabase falla de forma intermitente —medido el 14 de
 * septiembre de 2026, 6 de 17 lecturas de esta tabla en 504 o 502— y aquí una
 * lectura fallida no es un inconveniente: es lo que hace creer al panel que el
 * token no está registrado y lo que llevaba al cron a refrescar el token
 * equivocado. Mismo criterio que la lectura de la cola de programadas.
 */
const INTENTOS_LECTURA = 3;
const ESPERA_LECTURA_MS = 600;

/**
 * A partir de cuántos días restantes se renueva.
 *
 * Veinte deja tres semanas de margen: aunque el cron diario falle varios días
 * seguidos —Supabase caído, Meta con problemas— sigue habiendo tiempo de
 * sobra antes de que el token muera de verdad.
 */
const DIAS_PARA_REFRESCAR = 20;

/** Por debajo de esto la interfaz lo pinta en ámbar: hay que mirarlo. */
export const DIAS_PARA_AVISAR = 10;

interface FilaToken {
  token: string;
  expira_en: string;
  refrescado_en: string;
}

export interface EstadoToken {
  /**
   * De dónde salió el token con el que se está publicando.
   *
   * `desconocido` **no** es lo mismo que `entorno`, y confundirlos costó caro:
   * aquel dice "no se pudo leer la tabla" y este "la tabla está vacía". Con
   * los dos colapsados en un `diasRestantes: null`, un 504 de Supabase hacía
   * que el panel anunciara "el token todavía no está registrado" sobre una
   * fila perfectamente sana, y —peor— que el cron forzara un refresco del
   * token del **entorno**, que es la semilla vieja y no el que se viene
   * renovando. Verificado el 14 de septiembre de 2026: la tabla decía 58 días
   * restantes mientras el panel pedía registrarlo.
   */
  origen: "tabla" | "entorno" | "desconocido";
  /** `null` cuando nunca se ha refrescado o cuando no se pudo leer: mirar `origen`. */
  diasRestantes: number | null;
  expiraEn: string | null;
  refrescadoEn: string | null;
}

function credencialesSupabase(): { base: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return { base: `${url.replace(/\/$/, "")}/rest/v1/${TABLA}`, key };
}

async function rest<T>(query: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { base, key } = credencialesSupabase();
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

async function leerFila(): Promise<FilaToken | null> {
  let ultimo: unknown;

  for (let intento = 1; intento <= INTENTOS_LECTURA; intento += 1) {
    try {
      const filas = await rest<FilaToken[]>(`?clave=eq.${CLAVE}&select=token,expira_en,refrescado_en`);
      return filas?.[0] ?? null;
    } catch (error) {
      ultimo = error;
      console.error(`[instagram-token] lectura fallida (intento ${intento})`, error);
      if (intento < INTENTOS_LECTURA) {
        await new Promise((resolve) => setTimeout(resolve, ESPERA_LECTURA_MS));
      }
    }
  }

  throw ultimo;
}

/** La fila, memorizada unos minutos: una publicación la pide varias veces. */
function leerFilaCacheada(): Promise<FilaToken | null> {
  return withCache(CLAVE_CACHE, TTL_CACHE_MS, leerFila);
}

/**
 * El token con el que hay que hablarle a la Graph API ahora mismo.
 *
 * Prefiere el guardado —es el único que se renueva solo— y cae al del entorno
 * ante cualquier problema: sin fila todavía, o con Supabase sin responder.
 * Nunca devuelve `undefined` sin haberlo intentado por las dos vías.
 */
export async function tokenActual(): Promise<string | undefined> {
  try {
    const fila = await leerFilaCacheada();
    if (fila?.token) return fila.token;
  } catch {
    // Supabase caído no puede impedir publicar: sigue el token del entorno.
  }
  return process.env.IG_ACCESS_TOKEN;
}

function diasHasta(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / DIA_MS);
}

/**
 * Qué se sabe del token: de dónde sale y cuánto le queda.
 *
 * Sin fila devuelve `diasRestantes: null` y no un número inventado — es la
 * misma regla que gobierna el resto del proyecto: "no hay dato" y "el dato es
 * cero" no se pueden leer igual. La interfaz lo muestra como "sin registrar"
 * e invita a refrescarlo una primera vez.
 */
export async function estadoToken(): Promise<EstadoToken> {
  let fila: FilaToken | null;
  try {
    fila = await leerFilaCacheada();
  } catch {
    // No se pudo leer: se dice así. Publicar sigue funcionando con el token
    // del entorno (`tokenActual()`), pero nadie puede afirmar desde aquí que
    // la tabla esté vacía.
    return { origen: "desconocido", diasRestantes: null, expiraEn: null, refrescadoEn: null };
  }

  if (!fila) {
    return { origen: "entorno", diasRestantes: null, expiraEn: null, refrescadoEn: null };
  }

  return {
    origen: "tabla",
    diasRestantes: diasHasta(fila.expira_en),
    expiraEn: fila.expira_en,
    refrescadoEn: fila.refrescado_en,
  };
}

interface RespuestaRefresco {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string };
}

export interface ResultadoRefresco {
  refrescado: boolean;
  motivo: string;
  diasRestantes: number | null;
}

/**
 * Renueva el token contra Meta y guarda el nuevo con su fecha de caducidad.
 *
 * `forzar` salta la comprobación de días restantes, que es lo que necesita el
 * botón del panel: sirve para inicializar la tabla la primera vez, cuando
 * todavía no hay ninguna fecha con la que decidir.
 *
 * Lanza si Meta rechaza el refresco. Quien llama —el cron o la ruta del
 * panel— decide qué hacer con eso: aquí no se puede tragar el error, porque
 * un token que no se renueva es exactamente el fallo silencioso que este
 * módulo existe para evitar.
 */
export async function refrescarToken(forzar = false): Promise<ResultadoRefresco> {
  const estado = await estadoToken();

  // Sin poder leer la fila no se refresca, **ni siquiera forzando**. Aquí
  // `tokenActual()` caería al `IG_ACCESS_TOKEN` del entorno, que es la semilla
  // original y no el token que se viene renovando desde hace meses: Meta lo
  // rechaza si ya caducó —y si lo aceptara sería peor, porque guardaría
  // encima de la fila buena un token derivado del viejo—. Un fallo de lectura
  // no puede convertirse en una escritura a ciegas sobre una credencial.
  if (estado.origen === "desconocido") {
    throw new Error(
      "No se pudo leer el token guardado en Supabase, así que no se refresca: hacerlo usaría el token del entorno y reemplazaría el que está en uso. Volvé a intentarlo en un momento.",
    );
  }

  if (!forzar && estado.diasRestantes !== null && estado.diasRestantes > DIAS_PARA_REFRESCAR) {
    return {
      refrescado: false,
      motivo: `Todavía le quedan ${estado.diasRestantes} días`,
      diasRestantes: estado.diasRestantes,
    };
  }

  const token = await tokenActual();
  if (!token) throw new Error("No hay token de Instagram ni en la tabla ni en el entorno");

  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json()) as RespuestaRefresco;

  if (!res.ok || !body.access_token || !body.expires_in) {
    throw new Error(body.error?.message ?? `Meta respondió ${res.status} al refrescar el token`);
  }

  const expiraEn = new Date(Date.now() + body.expires_in * 1000).toISOString();

  await rest("", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      clave: CLAVE,
      token: body.access_token,
      expira_en: expiraEn,
      refrescado_en: new Date().toISOString(),
    }),
  });

  // La caché en memoria guarda el token viejo; sin esto, esta instancia
  // seguiría publicando con él hasta cinco minutos más. Sigue siendo válido,
  // pero el objetivo del refresco es dejar de usarlo.
  olvidar(CLAVE_CACHE);

  return {
    refrescado: true,
    motivo: "Token renovado",
    diasRestantes: diasHasta(expiraEn),
  };
}
