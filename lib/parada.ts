/**
 * Borrador detectado del post diario "Dólar en La Parada" (lanacionweb.com),
 * sobre la tabla que crean `supabase/migrations/0007_parada_pendiente.sql`
 * y `0008_parada_campos.sql`.
 *
 * Se habla con PostgREST por `fetch`, sin `@supabase/supabase-js`, mismo
 * criterio que `lib/enlaces.ts` y `lib/snapshot-hoy.ts`.
 *
 * La `service_role` key salta el RLS, así que este módulo es **solo de
 * servidor**: nunca debe importarse desde un componente de cliente ni
 * exponerse con prefijo `NEXT_PUBLIC_`.
 */

import { withCache } from "@/lib/cache";

const TIMEOUT_MS = 10_000;
const TABLA = "parada_pendiente";
const CLAVE = "parada";

/** Lugar por defecto del badge de ubicación, con el mismo texto que el resto del proyecto usa para esta fuente. */
export const LUGAR_PARADA_DEFECTO = "La Parada, Villa del Rosario";

export interface ParadaBorrador {
  url: string;
  titulo: string;
  imagenUrl: string;
  caption: string;
  lugar: string;
  /** `null` hasta que el admin la confirma en `/admin/parada` — nunca se adivina de la prosa scrapeada. */
  compra: string | null;
  venta: string | null;
  publicado: boolean;
  detectadoEn: string;
}

interface FilaParada {
  url: string;
  titulo: string;
  imagen_url: string;
  caption: string;
  lugar: string;
  compra: string | null;
  venta: string | null;
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
    lugar: fila.lugar,
    compra: fila.compra,
    venta: fila.venta,
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
 * artículo que todavía no se revisó, y `compra`/`venta` arrancan vacíos: se
 * extraen con una expresión regular sobre prosa libre, y ya se vio fallar
 * ese enfoque (texto de otro artículo colándose en el cuerpo scrapeado). El
 * admin las confirma a mano en `/admin/parada` antes de publicar.
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
      lugar: LUGAR_PARADA_DEFECTO,
      compra: null,
      venta: null,
      publicado: false,
      detectado_en: new Date().toISOString(),
    }),
  });
}

/**
 * Guarda los campos que el admin edita en `/admin/parada` antes de publicar
 * (lugar, compra, venta y el caption, si lo tocó). Separado de
 * `guardarParadaPendiente()` porque ese lo llama el cron para un borrador
 * *nuevo*, y este actualiza el que ya existe.
 */
export async function guardarCamposParada(campos: {
  lugar: string;
  compra: string | null;
  venta: string | null;
  caption: string;
}): Promise<void> {
  await rest<undefined>(`?clave=eq.${CLAVE}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      lugar: campos.lugar,
      compra: campos.compra,
      venta: campos.venta,
      caption: campos.caption,
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

/**
 * La tarjeta de "Dólar en La Parada" que se muestra en la portada, o `null`
 * si no hay nada que enseñar todavía.
 *
 * Solo cuenta un borrador ya **publicado**: uno a medio revisar en
 * `/admin/parada` puede tener cifras que el admin todavía está corrigiendo, y
 * la portada no es el lugar para mostrar un número sin confirmar — mismo
 * criterio que ya rige el resto del proyecto ("revisión humana antes de que
 * se vea al público").
 *
 * Va detrás de `withCache`, con el mismo TTL que `getRates()`: sin esto,
 * cada visita a la portada sería una consulta a Supabase por visitante, la
 * misma regla que ya prohíbe leer `historico_tasas` desde ahí.
 */
export async function paradaDelDia(): Promise<ParadaBorrador | null> {
  try {
    return await withCache("parada-del-dia", 5 * 60 * 1000, async () => {
      const borrador = await leerParadaPendiente();
      if (!borrador?.publicado || !borrador.compra || !borrador.venta) return null;
      return borrador;
    });
  } catch {
    // Un Supabase caído no puede tumbar la portada: la tarjeta simplemente no sale.
    return null;
  }
}
