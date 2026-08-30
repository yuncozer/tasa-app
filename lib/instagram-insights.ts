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

import { horaCaracas } from "@/lib/format";
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

/** Cuántos días caben en un día, para desplazar ventanas. */
const DIA_S = 24 * 60 * 60;

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
  /**
   * Los mismos totales, para el período inmediatamente anterior y de la misma
   * duración. Es lo que convierte "alcance: 4.120" en "alcance: 4.120, un 18 %
   * más que los 30 días anteriores", que es la cifra que de verdad dice algo.
   */
  totalesAnteriores: Partial<Record<MetricaTotal, number | null>>;
  /** Alcance día a día, para la barra del panel. Vacío si la métrica no está. */
  alcanceDiario: { fecha: string; valor: number }[];
  publicaciones: MediaConMetricas[];
  /** Qué falló, en lenguaje llano, para que el panel lo diga en vez de callarlo. */
  avisos: string[];
}

/**
 * Cuántos posts se miran para comparar franjas horarias, y cuántos hacen
 * falta como mínimo en cada una para decir algo.
 *
 * Con cinco por franja una sola publicación excepcional deja de mandar sobre
 * la conclusión, sobre todo usando la mediana. Por debajo de eso no se
 * compara: una recomendación sacada de dos posts es una corazonada con cara
 * de dato, que es peor que no decir nada.
 */
const POSTS_PARA_FRANJAS = 50;
const MINIMO_POR_FRANJA = 5;

/** Antes o después del mediodía en Caracas: son las dos franjas en que se publica. */
export type Franja = "manana" | "tarde";

export interface PostDestacado {
  caption: string | null;
  permalink: string;
  interacciones: number;
  timestamp: string;
}

export interface ActividadInstagram {
  franjas: ComparacionFranjas | null;
  /** Cuántas publicaciones salieron dentro del período que se está mirando. */
  postsEnPeriodo: number;
  /** La que más interacciones públicas juntó en el período. */
  mejorPost: PostDestacado | null;
  /** La mediana de interacciones del período, para saber si el mejor destaca. */
  medianaPeriodo: number | null;
}

export interface ComparacionFranjas {
  /** Qué franja rinde más, o `null` si la diferencia no llega a ser una. */
  mejor: Franja | null;
  /** Cuánto más rinde, en porcentaje sobre la otra. */
  diferencia: number;
  medianaManana: number;
  medianaTarde: number;
  postsManana: number;
  postsTarde: number;
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

/**
 * Un total del período. `null` si esta cuenta no expone la métrica.
 *
 * `desplazar` corre la ventana hacia atrás tantos días como dure, que es lo
 * que permite pedir "el período anterior" con la misma llamada: sin eso las
 * cifras son números sueltos y no se puede decir si la cuenta crece.
 */
async function totalDe(
  metrica: MetricaTotal,
  dias: number,
  desplazar = 0,
): Promise<number | null> {
  const { accountId } = await credenciales();
  const body = await graph<RespuestaInsights>(`/${accountId}/insights`, {
    metric: metrica,
    metric_type: "total_value",
    period: "day",
    ...rango(dias, desplazar),
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
function rango(dias: number, desplazarDias = 0): { since: string; until: string } {
  const ancho = Math.min(dias, MAX_DIAS) * DIA_S;
  const hasta = Math.floor(Date.now() / 1000) - desplazarDias * DIA_S;
  return { since: String(hasta - ancho), until: String(hasta) };
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
 * Cuánto cambió una cifra respecto de la anterior, en porcentaje.
 *
 * `null` cuando no hay con qué comparar o cuando la referencia es cero: un
 * crecimiento "infinito" desde cero no es una cifra que se pueda enseñar, y
 * un 0 % diría que no cambió, que es distinto de no saberlo.
 */
export function variacionPorcentual(
  actual: number | null | undefined,
  anterior: number | null | undefined,
): number | null {
  if (typeof actual !== "number" || typeof anterior !== "number") return null;
  if (anterior === 0) return null;
  return (actual / anterior - 1) * 100;
}

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
}

/**
 * Lo que se puede saber de la actividad reciente con **una sola llamada**: en
 * qué franja rinde mejor, cuántos posts salieron en el período y cuál fue el
 * mejor.
 *
 * **Se mide con las interacciones públicas** (me gusta + comentarios), que
 * vienen en el propio listado de medias, y no con el alcance: aquel exige una
 * llamada de `insights` por publicación, o sea cincuenta llamadas cada vez
 * que alguien abre la pestaña, para una pregunta que se consulta de vez en
 * cuando. La conclusión que interesa —qué franja funciona mejor— aguanta esa
 * aproximación; el alcance exacto de cada post ya está en la lista de abajo.
 *
 * **Mediana y no promedio**: un post que se viralizó desplazaría el promedio
 * de su franja y haría recomendar una hora por una casualidad.
 *
 * Devuelve `null` cuando no hay material suficiente. Ese caso no es un error
 * ni un cero: es "todavía no se puede responder", y la interfaz lo dice con
 * esas palabras en vez de enseñar una recomendación endeble.
 */
export async function resumenActividad(dias: number): Promise<ActividadInstagram> {
  const vacio: ActividadInstagram = {
    franjas: null,
    postsEnPeriodo: 0,
    mejorPost: null,
    medianaPeriodo: null,
  };

  try {
    const { accountId } = await credenciales();
    const listado = await graph<{ data?: FilaMedia[] }>(`/${accountId}/media`, {
      fields: "id,caption,permalink,timestamp,like_count,comments_count",
      limit: String(POSTS_PARA_FRANJAS),
    });

    const manana: number[] = [];
    const tarde: number[] = [];
    const delPeriodo: { post: PostDestacado; interacciones: number }[] = [];
    const desde = Date.now() - dias * DIA_S * 1000;

    for (const media of listado.data ?? []) {
      const interacciones = (media.like_count ?? 0) + (media.comments_count ?? 0);
      const cuando = new Date(media.timestamp).getTime();

      // La hora se lee en Caracas, no en UTC: publicar "a las 9" significa
      // las 9 de allá, que es lo que decide quién está mirando el teléfono.
      const hora = horaCaracas(cuando);
      (hora < 12 ? manana : tarde).push(interacciones);

      if (cuando >= desde) {
        delPeriodo.push({
          post: {
            caption: media.caption ?? null,
            permalink: media.permalink,
            interacciones,
            timestamp: media.timestamp,
          },
          interacciones,
        });
      }
    }

    const mejor = delPeriodo.reduce<{ post: PostDestacado; interacciones: number } | null>(
      (top, actual) => (top === null || actual.interacciones > top.interacciones ? actual : top),
      null,
    );

    const base = {
      postsEnPeriodo: delPeriodo.length,
      mejorPost: mejor?.post ?? null,
      medianaPeriodo: delPeriodo.length ? mediana(delPeriodo.map((f) => f.interacciones)) : null,
    };

    if (manana.length < MINIMO_POR_FRANJA || tarde.length < MINIMO_POR_FRANJA) {
      return { ...vacio, ...base };
    }

    const medianaManana = mediana(manana);
    const medianaTarde = mediana(tarde);
    const mayor = Math.max(medianaManana, medianaTarde);
    const menor = Math.min(medianaManana, medianaTarde);

    // Sin base con la que dividir no hay porcentaje que dar.
    if (menor === 0) return { ...vacio, ...base };

    const diferencia = (mayor / menor - 1) * 100;

    return {
      ...base,
      franjas: {
        // Por debajo del 15 % la diferencia no sobrevive al ruido de una
        // cuenta pequeña: se dice que están parejas en vez de recomendar.
        mejor: diferencia < 15 ? null : medianaTarde > medianaManana ? "tarde" : "manana",
        diferencia,
        medianaManana,
        medianaTarde,
        postsManana: manana.length,
        postsTarde: tarde.length,
      },
    };
  } catch {
    return vacio;
  }
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
    totalesAnteriores: {},
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

  const [datosPerfil, serie, posts, ...medidas] = await Promise.all([
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
    // El período anterior va en su propio grupo de llamadas y con su propio
    // `catch`: si Meta no da datos tan atrás, se pierde la comparación pero
    // no las cifras de este período, que son las que siempre tienen que salir.
    ...METRICAS_TOTALES.map((metrica) => totalDe(metrica, dias, dias).catch(() => null)),
  ]);

  const cuantas = METRICAS_TOTALES.length;
  const totales = medidas.slice(0, cuantas);
  const anteriores = medidas.slice(cuantas);

  return {
    perfil: datosPerfil,
    totales: Object.fromEntries(METRICAS_TOTALES.map((metrica, i) => [metrica, totales[i]])),
    totalesAnteriores: Object.fromEntries(
      METRICAS_TOTALES.map((metrica, i) => [metrica, anteriores[i]]),
    ),
    alcanceDiario: serie,
    publicaciones: posts,
    avisos,
  };
}
