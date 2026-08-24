/**
 * Borrador detectado del post diario "Dólar en La Parada" (lanacionweb.com),
 * sobre la tabla que crea `supabase/migrations/0007_parada_pendiente.sql`.
 *
 * Se habla con PostgREST por `fetch`, sin `@supabase/supabase-js`, mismo
 * criterio que `lib/enlaces.ts` y `lib/snapshot-hoy.ts`.
 *
 * La `service_role` key salta el RLS, así que este módulo es **solo de
 * servidor**: nunca debe importarse desde un componente de cliente ni
 * exponerse con prefijo `NEXT_PUBLIC_`.
 */

const TIMEOUT_MS = 10_000;
const TABLA = "parada_pendiente";
const CLAVE = "parada";

export interface ParadaBorrador {
  url: string;
  titulo: string;
  imagenUrl: string;
  caption: string;
  publicado: boolean;
  detectadoEn: string;
}

interface FilaParada {
  url: string;
  titulo: string;
  imagen_url: string;
  caption: string;
  publicado: boolean;
  detectado_en: string;
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

function desdeFila(fila: FilaParada): ParadaBorrador {
  return {
    url: fila.url,
    titulo: fila.titulo,
    imagenUrl: fila.imagen_url,
    caption: fila.caption,
    publicado: fila.publicado,
    detectadoEn: fila.detectado_en,
  };
}

/** El borrador guardado ahora mismo, o `null` si el cron todavía no ha detectado ninguno. */
export async function leerParadaPendiente(): Promise<ParadaBorrador | null> {
  const filas = await rest<FilaParada[]>(`?clave=eq.${CLAVE}&select=*&limit=1`, { method: "GET" });
  return filas[0] ? desdeFila(filas[0]) : null;
}

/**
 * Guarda un borrador nuevo, reemplazando el anterior. Lo llama el cron de
 * vigilancia en cuanto detecta un artículo distinto del que ya tenía
 * guardado — `publicado` arranca en `false` porque es, por definición, un
 * artículo que todavía no se revisó.
 */
export async function guardarParadaPendiente(borrador: {
  url: string;
  titulo: string;
  imagenUrl: string;
  caption: string;
}): Promise<void> {
  await rest<undefined>("", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      clave: CLAVE,
      url: borrador.url,
      titulo: borrador.titulo,
      imagen_url: borrador.imagenUrl,
      caption: borrador.caption,
      publicado: false,
      detectado_en: new Date().toISOString(),
    }),
  });
}

/** Marca el borrador actual como ya publicado, para que `/admin/parada` deje de ofrecerlo. */
export async function marcarParadaPublicada(): Promise<void> {
  await rest<undefined>(`?clave=eq.${CLAVE}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ publicado: true }),
  });
}
