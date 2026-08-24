/**
 * Enlaces cortos del dominio propio, sobre la tabla que crea
 * `supabase/migrations/0003_enlaces.sql`.
 *
 * Se habla con PostgREST por `fetch`, sin `@supabase/supabase-js`, por el
 * mismo motivo que `lib/programadas.ts`: son dos operaciones y el proyecto ya
 * resuelve así lo equivalente.
 *
 * La `service_role` key salta el RLS, así que este módulo es **solo de
 * servidor**: nunca debe importarse desde un componente de cliente ni
 * exponerse con prefijo `NEXT_PUBLIC_`.
 */

import { randomBytes } from "node:crypto";
import { perfilInstagram } from "@/lib/atajos";
import { esUrlValida } from "@/lib/validar-url";

const TIMEOUT_MS = 10_000;
const TABLA = "enlaces";

/**
 * `"hoy"` es la única clave fija; el resto son slugs de post
 * (`generarSlugPost()`), uno por publicación de noticia. No vale la pena un
 * tipo literal por cada uno como con `"hoy"` — son opacos por diseño.
 */
export type ClaveEnlace = string;

/**
 * Slug corto y opaco para `/p/<slug>`, el atajo de un post de noticia —el
 * mismo papel que `/hoy` cumple para el post diario, pero uno por post en vez
 * de uno fijo, porque en un mismo día puede salir más de una noticia.
 *
 * Se genera **antes** de publicar y va dentro del caption; el permalink real
 * se anota después (`guardarEnlace`), igual que ya hace el cron de tasas con
 * `/hoy`. 6 bytes en base64url dan slugs de 8 caracteres, sin choques
 * prácticos para el volumen de esta cuenta.
 */
export function generarSlugPost(): string {
  return randomBytes(6).toString("base64url");
}

interface FilaEnlace {
  clave: string;
  url: string;
  actualizado_en: string;
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

/** A dónde apunta un atajo ahora mismo, o `null` si nadie lo ha anotado todavía. */
export async function leerEnlace(clave: ClaveEnlace): Promise<string | null> {
  const filas = await rest<FilaEnlace[]>(
    `?clave=eq.${encodeURIComponent(clave)}&select=url&limit=1`,
    { method: "GET" },
  );
  return filas[0]?.url ?? null;
}

/**
 * Apunta un atajo a otra URL, creándolo si no existía.
 *
 * Es un `upsert` (`Prefer: resolution=merge-duplicates`) y no un insert más un
 * update: el caso normal es que la fila ya exista y solo cambie el destino, y
 * dos publicaciones al día no merecen dos viajes a Supabase.
 */
export async function guardarEnlace(clave: ClaveEnlace, url: string): Promise<void> {
  await rest<undefined>("", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ clave, url, actualizado_en: new Date().toISOString() }),
  });
}

/**
 * A dónde manda `/hoy`, con sus dos respaldos.
 *
 * 1. Lo que anotó el cron al publicar el carrusel del día.
 * 2. `ENLACE_HOY`, para poder fijarlo a mano si algo falló.
 * 3. El perfil, que siempre existe: el enlace se comparte por WhatsApp y
 *    llevar al perfil es peor que llevar al post, pero mucho mejor que un
 *    error.
 *
 * Cada candidato pasa por `esUrlValida()` antes de aceptarse. Un valor
 * corrupto en la tabla o una variable mal pegada no debe dejar el atajo
 * apuntando a algo que el navegador no sepa abrir.
 */
export async function destinoDeHoy(): Promise<string> {
  try {
    const anotado = await leerEnlace("hoy");
    if (esUrlValida(anotado)) return anotado;
  } catch {
    // Supabase caído no puede tumbar el enlace que se comparte: se sigue
    // bajando por los respaldos.
  }

  const deEntorno = process.env.ENLACE_HOY;
  if (esUrlValida(deEntorno)) return deEntorno;

  return perfilInstagram();
}

/**
 * A dónde manda `/p/<slug>`, el atajo de un post de noticia.
 *
 * Solo dos respaldos y no tres como `/hoy`: no hay variable de entorno que
 * tenga sentido para un slug que no existía hasta que se publicó ese post en
 * concreto. Si el slug no está anotado todavía —el post se está publicando en
 * este mismo instante— o Supabase falla, cae directo al perfil.
 */
export async function destinoDePost(slug: string): Promise<string> {
  try {
    const anotado = await leerEnlace(slug);
    if (esUrlValida(anotado)) return anotado;
  } catch {
    // Igual que en `destinoDeHoy`: un Supabase caído no debe tumbar el enlace.
  }

  return perfilInstagram();
}

/**
 * A dónde manda `/laparada`. Mismos dos respaldos que `/p/<slug>` y no los
 * tres de `/hoy`: no hay una variable de entorno que tenga sentido antes de
 * la primera publicación de esta serie. Lo anota
 * `app/api/admin/publish-parada/route.ts` justo después de publicar.
 */
export async function destinoDeLaParada(): Promise<string> {
  try {
    const anotado = await leerEnlace("laparada");
    if (esUrlValida(anotado)) return anotado;
  } catch {
    // Un Supabase caído no debe tumbar el enlace: se sigue al perfil.
  }

  return perfilInstagram();
}
