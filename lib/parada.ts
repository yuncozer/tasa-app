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
import { diaColombiaISO } from "@/lib/format";

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
  /**
   * `article:published_time` del artículo, o `null` si el portal no lo
   * declaró. Es lo que permite saber si el borrador es la columna **de hoy**:
   * `detectadoEn` solo dice cuándo lo vio el cron, que puede ser días después
   * si la vigilancia estuvo caída.
   */
  fechaArticulo: string | null;
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
  fecha_articulo: string | null;
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
    fechaArticulo: fila.fecha_articulo ?? null,
  };
}

/**
 * El día del mes que declara el propio titular: "Dólar en La Parada este 27A"
 * → 27.
 *
 * Hace falta porque **lanacionweb no fecha sus artículos**: verificado en
 * vivo el 2026-08-28, ni el HTML del artículo ni el listado traen
 * `article:published_time`, `datePublished` ni un `<time>`. Lo único que dice
 * de qué día es la columna es su propio título, que el portal escribe
 * siempre con esta forma (verificado también con "Dólar en La Parada este
 * 26A").
 *
 * Solo se lee el **número**, no la letra del mes: "A" lo mismo vale para
 * abril que para agosto, y adivinarlo sería inventar. El número basta para lo
 * que hace falta —distinguir la columna de hoy de la de ayer— porque es una
 * columna diaria y lo que se compara siempre está a un día de distancia.
 */
export function diaDelTitulo(titulo: string): number | null {
  const match = /\beste\s+(\d{1,2})\s*[a-zA-Z]?\b/i.exec(titulo);
  if (!match) return null;

  const dia = Number(match[1]);
  return dia >= 1 && dia <= 31 ? dia : null;
}

/**
 * Si la columna guardada es la de hoy.
 *
 * Se juzga con dos señales, en este orden:
 *
 * 1. `article:published_time`, si el portal alguna vez lo declara. Es la
 *    buena, y se compara en **hora de Colombia**: el portal es colombiano y
 *    su titular se fecha con el día de allá, así que una columna publicada a
 *    las 11 de la noche en Cúcuta no puede contar como la del día siguiente.
 * 2. El día del mes que dice el propio titular, que hoy es lo único que hay.
 *
 * `esDeHoy: null` significa "no se puede saber" y no se confunde con `false`:
 * uno invita a revisar antes de publicar, el otro dice que las cifras ya no
 * son las del día.
 *
 * Vive aquí y no en la página que lo muestra para no llamar a `Date.now()`
 * dentro del render, que es impuro y el linter de React rechaza.
 */
export function diaDeLaColumna(
  fechaArticulo: string | null,
  titulo?: string,
): { dia: string | null; esDeHoy: boolean | null } {
  const hoy = diaColombiaISO(Date.now());

  if (fechaArticulo) {
    const dia = diaColombiaISO(new Date(fechaArticulo).getTime());
    return { dia, esDeHoy: dia === hoy };
  }

  const delTitulo = titulo ? diaDelTitulo(titulo) : null;
  if (delTitulo !== null) {
    return { dia: null, esDeHoy: delTitulo === Number(hoy.slice(8, 10)) };
  }

  return { dia: null, esDeHoy: null };
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
  /** Cuándo lo publicó el portal; `null` si no lo declara. */
  fechaArticulo: string | null;
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
      fecha_articulo: borrador.fechaArticulo,
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
