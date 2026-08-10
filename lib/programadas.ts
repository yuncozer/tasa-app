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

/**
 * Por dónde va una publicación que está en vuelo. Existe porque publicar un
 * carrusel con video no cabe en el tope de tiempo de una función: cada disparo
 * del cron avanza una fase y la deja anotada, y el siguiente retoma ahí.
 *
 * `publicando_meta` es la única irreversible —es el `media_publish`— y por eso
 * es también la única que **no** se retoma sola: reintentarla podría duplicar
 * el post en la cuenta real.
 */
export type FaseProgramada = "creando" | "esperando_hijos" | "esperando_padre" | "publicando_meta";

/** Los ids que devolvió Meta, para no volver a crear lo ya creado. */
export interface ContenedoresProgramada {
  hijos?: string[];
  tipos?: ("imagen" | "video")[];
  padre?: string;
}

export interface Programada {
  id: string;
  publicar_en: string;
  estado: EstadoProgramada;
  fase: FaseProgramada | null;
  contenedores: ContenedoresProgramada | null;
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
 * Borra una programada de la cola: una `pendiente` que ya no se quiere, o una
 * `fallida` que ya se leyó y estorba.
 *
 * Una `publicando` **no** se puede borrar: puede haber llegado a Meta, y
 * perder la fila perdería el rastro de qué salió y qué no.
 */
export async function cancelarProgramada(id: string): Promise<boolean> {
  const filas = await rest<Programada[]>(
    `?id=eq.${encodeURIComponent(id)}&estado=in.(pendiente,fallida)`,
    { method: "DELETE" },
  );
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
    const reclamada = await tomar(candidata, "estado=eq.pendiente");
    if (reclamada) return reclamada;
  }

  return null;
}

/**
 * Marca una fila como tomada por este disparo. El filtro extra viaja al `WHERE`
 * del `UPDATE`, que es lo que hace atómico el reclamo: si dos ejecuciones van a
 * la vez, la segunda ya no encuentra fila que casar y se va de vacío.
 */
async function tomar(candidata: Programada, filtro: string): Promise<Programada | null> {
  const filas = await rest<Programada[]>(`?id=eq.${encodeURIComponent(candidata.id)}&${filtro}`, {
    method: "PATCH",
    body: JSON.stringify({
      estado: "publicando",
      intentos: candidata.intentos + 1,
      arrancada_en: new Date().toISOString(),
      actualizada_en: new Date().toISOString(),
    }),
  });
  return filas[0] ?? null;
}

/**
 * Cuánto se espera antes de dar por muerta la ejecución que tenía una fila.
 * Por encima del tope de una función de Vercel (60 s), para no arrebatarle el
 * trabajo a un disparo que todavía está vivo.
 *
 * Solo hace falta para las ejecuciones que **mueren**: la que termina su turno
 * de forma ordenada suelta la fila (`liberarProgramada`) y la siguiente la
 * toma al instante, sin esperar este margen.
 */
const ABANDONADA_MS = 90_000;

/** Libre = nadie la tiene, o quien la tenía lleva demasiado sin dar señales. */
function filtroLibre(): string {
  const limite = new Date(Date.now() - ABANDONADA_MS).toISOString();
  return `estado=eq.publicando&fase=neq.publicando_meta&or=(arrancada_en.is.null,arrancada_en.lt.${limite})`;
}

/**
 * Retoma una publicación que quedó a medias, sea porque su ejecución agotó el
 * turno o porque murió.
 *
 * Solo las fases anteriores a publicar: crear contenedores o sondear estados se
 * puede repetir sin consecuencias —un contenedor de más caduca solo—, mientras
 * que `publicando_meta` puede haber llegado a Meta y reintentarla duplicaría el
 * post. Esas se quedan visibles en la cola para decidirlas a mano, que es el
 * lado seguro del error.
 */
export async function reclamarEnProceso(id?: string): Promise<Programada | null> {
  const filtro = filtroLibre() + (id ? `&id=eq.${encodeURIComponent(id)}` : "");
  const candidatas = await rest<Programada[]>(
    `?${filtro}&order=publicar_en.asc&limit=${CANDIDATAS}`,
    { method: "GET" },
  );

  for (const candidata of candidatas) {
    // El `arrancada_en` del filtro es lo que sostiene la atomicidad: el primero
    // que la toma lo pone en ahora, y el segundo ya no la ve libre.
    const reclamada = await tomar(candidata, filtro);
    if (reclamada) return reclamada;
  }

  return null;
}

/**
 * Suelta la fila al acabar el turno sin haber terminado, para que el siguiente
 * disparo —o el navegador, que está preguntando cada pocos segundos— la tome
 * enseguida en vez de esperar a que caduque el margen de abandono.
 */
export async function liberarProgramada(id: string): Promise<void> {
  await rest<void>(`?id=eq.${encodeURIComponent(id)}&estado=eq.publicando`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ arrancada_en: null, actualizada_en: new Date().toISOString() }),
  });
}

/** Una fila concreta, para saber en qué quedó. */
export async function leerProgramada(id: string): Promise<Programada | null> {
  const filas = await rest<Programada[]>(`?id=eq.${encodeURIComponent(id)}`, { method: "GET" });
  return filas[0] ?? null;
}

/**
 * Toma una fila concreta para publicarla ya, sin esperar a su hora ni al cron.
 * La usa el botón "Publicar ahora" de la cola, sobre una que falló o sobre una
 * pendiente que se quiere adelantar; empieza de cero (`fase` y `contenedores`
 * en blanco) porque los contenedores de un intento fallido pueden haber
 * caducado.
 */
export async function reclamarPorId(id: string): Promise<Programada | null> {
  const filas = await rest<Programada[]>(
    `?id=eq.${encodeURIComponent(id)}&estado=in.(pendiente,fallida)`,
    { method: "GET" },
  );
  const candidata = filas[0];
  if (!candidata) return null;

  const reclamada = await tomar(candidata, `estado=eq.${candidata.estado}`);
  if (!reclamada) return null;

  return guardarAvance(reclamada.id, { fase: "creando", contenedores: null, error: null });
}

/** Anota por dónde va la publicación, para que el disparo siguiente retome ahí. */
export async function guardarAvance(
  id: string,
  avance: { fase: FaseProgramada; contenedores?: ContenedoresProgramada | null; error?: null },
): Promise<Programada> {
  const filas = await rest<Programada[]>(`?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      fase: avance.fase,
      ...(avance.contenedores !== undefined ? { contenedores: avance.contenedores } : {}),
      ...(avance.error !== undefined ? { error: avance.error } : {}),
      arrancada_en: new Date().toISOString(),
      actualizada_en: new Date().toISOString(),
    }),
  });
  return filas[0];
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
    body: JSON.stringify({
      ...campos,
      // La fase solo tiene sentido mientras está en vuelo: dejarla puesta haría
      // que una fila ya cerrada apareciera como abandonada.
      fase: null,
      arrancada_en: null,
      actualizada_en: new Date().toISOString(),
    }),
  });
}
