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
  /** De dónde salió el token con el que se está publicando. */
  origen: "tabla" | "entorno";
  /** `null` cuando nunca se ha refrescado: sin fila no hay forma de saberlo. */
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
  const filas = await rest<FilaToken[]>(`?clave=eq.${CLAVE}&select=token,expira_en,refrescado_en`);
  return filas?.[0] ?? null;
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
  const fila = await leerFilaCacheada().catch(() => null);

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
