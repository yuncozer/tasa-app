/**
 * El snapshot exacto con el que se publicó el carrusel de tasas del día,
 * sobre la tabla que crea `supabase/migrations/0006_snapshot_hoy.sql`.
 *
 * `/api/og/instagram-post` y `/api/og/instagram-post-pesos` sirven dos cosas
 * distintas: la imagen que Instagram descarga al publicar, y la vista previa
 * de `/hoy`, que se pide en cualquier momento después de eso. Si esas rutas
 * siguieran llamando a `getRates()` en vivo, la segunda visita podía traer
 * una tasa distinta de la que ya quedó escrita en el caption publicado — el
 * dólar Binance se mueve en minutos, a diferencia del BCV, que solo cambia
 * una vez al día. `snapshotDelDia()` es lo que evita esa costura: la imagen
 * vuelve a ser exactamente la que se publicó, no una recalculada aparte.
 *
 * Se habla con PostgREST por `fetch`, sin `@supabase/supabase-js`, mismo
 * criterio que `lib/historico.ts` y `lib/enlaces.ts`.
 *
 * La `service_role` key salta el RLS, así que este módulo es **solo de
 * servidor**: nunca debe importarse desde un componente de cliente ni
 * exponerse con prefijo `NEXT_PUBLIC_`.
 */

import { getRates } from "@/lib/rates";
import type { RatesSnapshot } from "@/lib/types";

const TIMEOUT_MS = 10_000;
const TABLA = "snapshot_hoy";
const CLAVE = "hoy";

interface FilaSnapshot {
  clave: string;
  snapshot: RatesSnapshot;
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
 * Congela el snapshot que se acaba de publicar.
 *
 * Va **antes** de llamar a Meta, no después: los contenedores del carrusel
 * hacen que Meta se descargue las imágenes de inmediato, y para entonces esta
 * fila ya tiene que apuntar al mismo snapshot que arma el caption — así la
 * primera descarga y cualquier visita posterior a `/hoy` ven exactamente lo
 * mismo.
 */
export async function guardarSnapshotHoy(snapshot: RatesSnapshot): Promise<void> {
  await rest<undefined>("", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ clave: CLAVE, snapshot }),
  });
}

/** El snapshot congelado, o `null` si no se ha publicado ninguno todavía. */
export async function leerSnapshotHoy(): Promise<RatesSnapshot | null> {
  const filas = await rest<FilaSnapshot[]>(`?clave=eq.${CLAVE}&select=snapshot&limit=1`, { method: "GET" });
  return filas[0]?.snapshot ?? null;
}

/**
 * Lo que deben mostrar las imágenes del post diario: el snapshot congelado si
 * existe, y si no —arranque en frío, o Supabase caído— el de ahora mismo.
 * Degradar a `getRates()` es peor que la consistencia que se busca, pero
 * mejor que una imagen rota.
 */
export async function snapshotDelDia(): Promise<RatesSnapshot> {
  try {
    const congelado = await leerSnapshotHoy();
    if (congelado) return congelado;
  } catch {
    // Sin snapshot congelado, se sigue con el de ahora mismo.
  }

  return getRates();
}
