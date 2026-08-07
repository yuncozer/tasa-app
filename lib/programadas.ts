import type { PublicacionPayload } from "@/lib/publish-news";

/**
 * Cola de publicaciones programadas, sobre la tabla que crea
 * `supabase/migrations/0001_publicaciones_programadas.sql`.
 *
 * Se habla con PostgREST por `fetch`, sin `@supabase/supabase-js`: son cuatro
 * operaciones y el proyecto ya resuelve así lo equivalente — `lib/admin-session.ts`
 * firma la cookie a mano en vez de traer una librería de sesiones.
 *
 * La `service_role` key salta el RLS, así que este módulo es **solo de
 * servidor**: nunca debe importarse desde un componente de cliente ni
 * exponerse con prefijo `NEXT_PUBLIC_`.
 */

const TIMEOUT_MS = 10_000;
const TABLA = "publicaciones_programadas";

/** Cuántas candidatas pide el worker antes de rendirse (ver `reclamarVencida`). */
const CANDIDATAS = 3;

export type EstadoProgramada = "pendiente" | "publicando" | "publicada" | "fallida";

export interface Programada {
  id: string;
  publicar_en: string;
  estado: EstadoProgramada;
  payload: PublicacionPayload;
  media_id: string | null;
  error: string | null;
  intentos: number;
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

  // Con `return=minimal` PostgREST contesta 204 sin cuerpo, así que no se
  // puede llamar a `json()` a ciegas.
  const texto = await response.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

/** Deja un post listo para salir a la hora indicada. */
export async function programarPublicacion(
  publicarEn: string,
  payload: PublicacionPayload,
): Promise<Programada> {
  const filas = await rest<Programada[]>("", {
    method: "POST",
    body: JSON.stringify({ publicar_en: publicarEn, payload }),
  });
  return filas[0];
}

/**
 * La cola tal como se muestra en `/admin/noticia`. Las ya publicadas no
 * aparecen —su confirmación es el post en Instagram—, pero las fallidas sí, y
 * se quedan hasta que se borren: son la única forma de enterarse de que algo
 * no salió.
 */
export async function listarProgramadas(): Promise<Programada[]> {
  return rest<Programada[]>(
    "?estado=in.(pendiente,publicando,fallida)&order=publicar_en.asc&limit=50",
    { method: "GET" },
  );
}

/**
 * Cancela una programada. Solo si sigue `pendiente`: una que ya está
 * `publicando` puede haber llegado a Meta, y borrar la fila perdería el rastro.
 */
export async function cancelarProgramada(id: string): Promise<boolean> {
  const filas = await rest<Programada[]>(`?id=eq.${encodeURIComponent(id)}&estado=eq.pendiente`, {
    method: "DELETE",
  });
  return filas.length > 0;
}

/**
 * Toma una publicación vencida y la marca como `publicando` de forma atómica.
 *
 * El `estado=eq.pendiente` del filtro es lo importante: PostgREST lo traduce a
 * un `WHERE` sobre el `UPDATE`, así que si dos disparos del cron se solapan,
 * solo uno recibe la fila y el otro se va de vacío. Sin esa condición el modo
 * de fallo es un post duplicado en la cuenta real, que no se puede deshacer.
 *
 * Se prueban unas pocas candidatas porque perder la carrera por una no
 * significa que no haya otra vencida detrás.
 */
export async function reclamarVencida(): Promise<Programada | null> {
  const ahora = new Date().toISOString();
  const candidatas = await rest<Programada[]>(
    `?estado=eq.pendiente&publicar_en=lte.${ahora}&order=publicar_en.asc&limit=${CANDIDATAS}`,
    { method: "GET" },
  );

  for (const candidata of candidatas) {
    const filas = await rest<Programada[]>(
      `?id=eq.${encodeURIComponent(candidata.id)}&estado=eq.pendiente`,
      {
        method: "PATCH",
        body: JSON.stringify({
          estado: "publicando",
          intentos: candidata.intentos + 1,
          actualizada_en: new Date().toISOString(),
        }),
      },
    );
    if (filas.length > 0) return filas[0];
  }

  return null;
}

/**
 * Cierra una publicación con su resultado.
 *
 * No hay rescate automático de las que se queden en `publicando`: si una
 * ejecución muere después de que Meta haya aceptado el post, reintentarla lo
 * duplicaría. Se quedan visibles en la cola para que se decida a mano, que es
 * el lado seguro del error.
 */
export async function cerrarProgramada(
  id: string,
  resultado: { mediaId: string } | { error: string },
): Promise<void> {
  const campos =
    "mediaId" in resultado
      ? { estado: "publicada", media_id: resultado.mediaId, error: null }
      : { estado: "fallida", error: resultado.error };

  await rest<void>(`?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ ...campos, actualizada_en: new Date().toISOString() }),
  });
}
