/**
 * Métricas de la cuenta de Instagram, de solo lectura.
 *
 * Vive aparte de `lib/instagram.ts` a propósito: aquel publica —cada llamada
 * escribe en la cuenta real y es irreversible— y este solo pregunta. Comparten
 * el transporte (`GRAPH_BASE` y `credenciales()`) para que un cambio de versión
 * de la Graph API no se aplique a la mitad, y nada más.
 *
 * La regla que gobierna todo el módulo: **cada métrica degrada por su cuenta**.
 * La Graph API retira y renombra métricas sin aviso, y las disponibles dependen
 * de la cuenta y de su tamaño (Meta oculta varias por debajo de 100
 * seguidores). Una que hoy responde y mañana da error no puede dejar el panel
 * entero en blanco, así que cada consulta va en su propio `try/catch` y lo que
 * falla se devuelve como `null` — que la interfaz muestra como "Sin dato",
 * igual que hace el reporte semanal cuando falta una comparación.
 */

import { credenciales, GRAPH_BASE } from "@/lib/instagram";

const TIMEOUT_MS = 10_000;

/**
 * Métricas de cuenta que se piden como total del período.
 *
 * Se piden **una por una** y no en una sola llamada: la Graph API rechaza el
 * lote entero si una sola métrica no está disponible para esta cuenta, y
 * entonces se perderían también las que sí lo estaban.
 */
const METRICAS_TOTALES = ["reach", "profile_views", "accounts_engaged", "total_interactions"] as const;

type MetricaTotal = (typeof METRICAS_TOTALES)[number];

/** El día es el máximo período que acepta la API para la serie; el rango lo pone `since`/`until`. */
const MAX_DIAS = 30;

export interface PerfilInstagram {
  username: string | null;
  seguidores: number | null;
  publicaciones: number | null;
}

export interface MediaConMetricas {
  id: string;
  caption: string | null;
  permalink: string;
  timestamp: string;
  tipo: string;
  alcance: number | null;
  interacciones: number | null;
  meGusta: number | null;
  comentarios: number | null;
  guardados: number | null;
}

export interface AnaliticasInstagram {
  perfil: PerfilInstagram;
  /** Totales del período, `null` en las que la cuenta no expone. */
  totales: Partial<Record<MetricaTotal, number | null>>;
  /** Alcance día a día, para la barra del panel. Vacío si la métrica no está. */
  alcanceDiario: { fecha: string; valor: number }[];
  publicaciones: MediaConMetricas[];
  /** Qué falló, en lenguaje llano, para que el panel lo diga en vez de callarlo. */
  avisos: string[];
}

async function graph<T>(ruta: string, params: Record<string, string>): Promise<T> {
  const { accessToken } = await credenciales();
  const url = new URL(`${GRAPH_BASE}${ruta}`);
  for (const [clave, valor] of Object.entries(params)) url.searchParams.set(clave, valor);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Instagram respondió ${res.status}`);
  return body as T;
}

interface RespuestaInsights {
  data?: {
    name: string;
    total_value?: { value?: number };
    values?: { value: number; end_time: string }[];
  }[];
}

/** Un total del período. `null` si esta cuenta no expone la métrica. */
async function totalDe(metrica: MetricaTotal, dias: number): Promise<number | null> {
  const { accountId } = await credenciales();
  const body = await graph<RespuestaInsights>(`/${accountId}/insights`, {
    metric: metrica,
    metric_type: "total_value",
    period: "day",
    ...rango(dias),
  });
  const valor = body.data?.[0]?.total_value?.value;
  return typeof valor === "number" ? valor : null;
}

/**
 * El rango en segundos, que es como lo quiere la Graph API.
 *
 * `until` se deja en "ahora mismo" en vez de a medianoche: la API descarta el
 * día en curso si el rango no lo alcanza, y el panel se abre justamente para
 * ver cómo va hoy.
 */
function rango(dias: number): { since: string; until: string } {
  const ahora = Math.floor(Date.now() / 1000);
  return {
    since: String(ahora - Math.min(dias, MAX_DIAS) * 24 * 60 * 60),
    until: String(ahora),
  };
}

async function alcanceDiario(dias: number): Promise<{ fecha: string; valor: number }[]> {
  const { accountId } = await credenciales();
  const body = await graph<RespuestaInsights>(`/${accountId}/insights`, {
    metric: "reach",
    period: "day",
    ...rango(dias),
  });
  return (body.data?.[0]?.values ?? []).map((punto) => ({
    fecha: punto.end_time.slice(0, 10),
    valor: punto.value,
  }));
}

async function perfil(): Promise<PerfilInstagram> {
  const { accountId } = await credenciales();
  const body = await graph<{ username?: string; followers_count?: number; media_count?: number }>(
    `/${accountId}`,
    { fields: "username,followers_count,media_count" },
  );
  return {
    username: body.username ?? null,
    seguidores: body.followers_count ?? null,
    publicaciones: body.media_count ?? null,
  };
}

interface FilaMedia {
  id: string;
  caption?: string;
  permalink: string;
  timestamp: string;
  media_type: string;
  like_count?: number;
  comments_count?: number;
}

/**
 * Las últimas publicaciones con sus métricas.
 *
 * Las métricas de cada media van en una llamada aparte —la Graph API no las
 * devuelve junto al listado— así que se piden en paralelo y con su propio
 * `catch`: una publicación demasiado reciente, o un tipo de media sin
 * `insights`, no puede dejar la tabla entera vacía.
 */
async function publicaciones(cuantas: number): Promise<MediaConMetricas[]> {
  const { accountId } = await credenciales();
  const listado = await graph<{ data?: FilaMedia[] }>(`/${accountId}/media`, {
    fields: "id,caption,permalink,timestamp,media_type,like_count,comments_count",
    limit: String(cuantas),
  });

  return Promise.all(
    (listado.data ?? []).map(async (media) => {
      let alcance: number | null = null;
      let interacciones: number | null = null;
      let guardados: number | null = null;

      try {
        const body = await graph<RespuestaInsights>(`/${media.id}/insights`, {
          metric: "reach,total_interactions,saved",
        });
        for (const fila of body.data ?? []) {
          const valor = fila.values?.[0]?.value ?? fila.total_value?.value ?? null;
          if (fila.name === "reach") alcance = valor;
          if (fila.name === "total_interactions") interacciones = valor;
          if (fila.name === "saved") guardados = valor;
        }
      } catch {
        // Se queda con los contadores públicos del listado, que siempre vienen.
      }

      return {
        id: media.id,
        caption: media.caption ?? null,
        permalink: media.permalink,
        timestamp: media.timestamp,
        tipo: media.media_type,
        alcance,
        interacciones,
        meGusta: media.like_count ?? null,
        comentarios: media.comments_count ?? null,
        guardados,
      };
    }),
  );
}

/**
 * Todo lo que pinta la mitad de redes del panel, en una sola llamada.
 *
 * Nunca lanza: sin credenciales, con el token caducado o con la API caída
 * devuelve la estructura vacía y un aviso que explica por qué — mismo criterio
 * que `construirReporteSemanal()` y que `lib/ia.ts`. El panel de analíticas se
 * abre para mirar, y una pantalla de error no dice nada que un "Sin dato" con
 * su motivo no diga mejor.
 */
export async function leerAnaliticasInstagram(
  dias: number,
  cuantasPublicaciones = 6,
): Promise<AnaliticasInstagram> {
  const avisos: string[] = [];
  const vacio: AnaliticasInstagram = {
    perfil: { username: null, seguidores: null, publicaciones: null },
    totales: {},
    alcanceDiario: [],
    publicaciones: [],
    avisos,
  };

  try {
    await credenciales();
  } catch {
    avisos.push("Faltan IG_BUSINESS_ACCOUNT_ID o IG_ACCESS_TOKEN.");
    return vacio;
  }

  const [datosPerfil, serie, posts, ...totales] = await Promise.all([
    perfil().catch((error: Error) => {
      avisos.push(`No se pudo leer el perfil: ${error.message}`);
      return vacio.perfil;
    }),
    alcanceDiario(dias).catch(() => {
      avisos.push("Instagram no devolvió el alcance día a día para esta cuenta.");
      return [];
    }),
    publicaciones(cuantasPublicaciones).catch((error: Error) => {
      avisos.push(`No se pudieron leer las publicaciones: ${error.message}`);
      return [];
    }),
    ...METRICAS_TOTALES.map((metrica) => totalDe(metrica, dias).catch(() => null)),
  ]);

  return {
    perfil: datosPerfil,
    totales: Object.fromEntries(METRICAS_TOTALES.map((metrica, i) => [metrica, totales[i]])),
    alcanceDiario: serie,
    publicaciones: posts,
    avisos,
  };
}
