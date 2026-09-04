/**
 * Lado servidor de la analítica propia: escribe los eventos que manda
 * `lib/analitica-cliente.ts` y lee el resumen que pinta `/admin/analiticas`.
 *
 * Se habla con PostgREST por `fetch`, sin `@supabase/supabase-js`, por el
 * mismo motivo que `lib/historico.ts` y `lib/programadas.ts`: son dos
 * operaciones y el proyecto ya resuelve así lo equivalente.
 *
 * La `service_role` key salta el RLS, así que este módulo es **solo de
 * servidor**: nunca debe importarse desde un componente de cliente ni
 * exponerse con prefijo `NEXT_PUBLIC_`.
 */

import { diaCaracasISO } from "@/lib/format";
import { desplazarDia } from "@/lib/historico";

const TIMEOUT_MS = 10_000;

/**
 * Los tipos que se aceptan, y no uno más.
 *
 * La ruta es pública por necesidad —la llama el navegador de cualquier
 * visitante— así que lo que se guarda tiene que estar acotado aquí: sin esta
 * lista, cualquiera podría llenar la tabla de tipos inventados y el panel
 * dejaría de decir nada.
 */
const TIPOS = new Set([
  "visita",
  "atajo",
  "conversion",
  "copiar",
  "compartir",
  "pegar",
  "actualizar",
  "instalar",
  "sin_conexion",
]);

/** Tope de longitud de cada campo de texto, por lo mismo que el conjunto de tipos. */
const MAX_TEXTO = 80;

export interface EventoEntrante {
  tipo: string;
  detalle?: unknown;
  ruta?: unknown;
  sesion?: unknown;
  dispositivo?: unknown;
  instalada?: unknown;
  referente?: unknown;
}

interface FilaEvento {
  fecha: string;
  tipo: string;
  ruta: string | null;
  detalle: string | null;
  sesion: string;
  dispositivo: string | null;
  instalada: boolean;
  referente: string | null;
}

function credenciales(): { base: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return { base: `${url.replace(/\/$/, "")}/rest/v1`, key };
}

async function rest<T>(ruta: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { base, key } = credenciales();
  const { prefer, ...resto } = init;

  const response = await fetch(`${base}${ruta}`, {
    ...resto,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? "return=minimal",
      ...resto.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase respondió ${response.status}: ${await response.text()}`);
  }

  const texto = await response.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().slice(0, MAX_TEXTO);
  return limpio === "" ? null : limpio;
}

/**
 * Valida y normaliza lo que llegó del navegador.
 *
 * Devuelve `null` en vez de lanzar: un cuerpo mal formado no es un incidente
 * que valga la pena reportar, y la ruta contesta lo mismo en los dos casos
 * para no convertirse en un oráculo de qué acepta y qué no.
 */
export function normalizarEvento(entrante: EventoEntrante): FilaEvento | null {
  const tipo = texto(entrante.tipo);
  const sesion = texto(entrante.sesion);
  if (!tipo || !TIPOS.has(tipo) || !sesion) return null;

  const dispositivo = texto(entrante.dispositivo);

  return {
    // La fecha la pone el servidor, no el navegador: el reloj del teléfono se
    // puede mover y esta columna es la que agrupa todo el panel.
    fecha: diaCaracasISO(Date.now()),
    tipo,
    ruta: texto(entrante.ruta),
    detalle: texto(entrante.detalle),
    sesion,
    dispositivo: dispositivo === "movil" || dispositivo === "escritorio" ? dispositivo : null,
    instalada: entrante.instalada === true,
    referente: texto(entrante.referente),
  };
}

export async function guardarEvento(fila: FilaEvento): Promise<void> {
  await rest("/eventos_web", { method: "POST", body: JSON.stringify(fila) });
}

/**
 * Quién pidió la página: una persona o el rastreador que arma la vista previa.
 *
 * Los atajos se cuentan **en el servidor** y no en el navegador porque `/wa` y
 * `/ig` no sirven HTML donde pudiera correr nada, y porque `/hoy`, `/laparada`
 * y `/p/<slug>` redirigen con un `<meta refresh>` inmediato: un evento
 * disparado al hidratar llegaría tarde la mitad de las veces. La contrapartida
 * es que aquí sí pasan los rastreadores —el de WhatsApp pide `/hoy` cada vez
 * que alguien pega el enlace en un chat— y contarlos inflaría justo la cifra
 * que se mira para saber cuánta gente abre el enlace. De ahí este filtro.
 *
 * Es deliberadamente burdo: reconocer bots por su user-agent nunca es exacto,
 * pero los que importan aquí se anuncian con todas las letras, y el error de
 * los que no se declaran es mucho menor que el de contarlos todos.
 */
const RASTREADORES = /bot|crawler|spider|facebookexternalhit|whatsapp|preview|curl|wget|headless/i;

/**
 * Los atajos que se miden. Conjunto cerrado, igual que los tipos de evento:
 * lo que llega desde una ruta se guarda tal cual, así que tiene que estar
 * enumerado aquí y no venir de la URL.
 */
export type Atajo = "/hoy" | "/wa" | "/ig" | "/laparada" | "/e";

/**
 * Anota un clic en un atajo del dominio.
 *
 * Nunca lanza: estas rutas existen para llevar a alguien a otro sitio, y un
 * Supabase caído no puede impedir que el enlace funcione — mismo criterio que
 * `anotarEnlacePost()` con la publicación ya hecha.
 *
 * La `sesion` es aleatoria por visita y no se comparte con la del navegador:
 * aquí no hay pestaña con la que correlacionar nada, y la columna es `not
 * null` porque para todo lo demás sí lo es. En la práctica significa que cada
 * clic en un atajo cuenta como una sesión distinta, que es lo que de verdad
 * describe: quien abre `/hoy` se va del sitio.
 */
export async function registrarAtajo(
  atajo: Atajo,
  cabeceras: {
    userAgent: string | null;
    referer: string | null;
    /**
     * La ruta concreta, cuando el atajo tiene varias: `/e/<slug>` apunta a un
     * post distinto por slug, y sin esto todos sus clics se sumarían en una
     * sola cifra sin poder saber cuál se abrió. El slug no viene de la URL
     * cruda sino del que la página acaba de resolver contra la tabla, así que
     * no es texto que alguien pueda inventar desde fuera — que es la razón por
     * la que `detalle` sigue siendo del conjunto cerrado.
     */
    ruta?: string;
  },
): Promise<void> {
  try {
    if (cabeceras.userAgent && RASTREADORES.test(cabeceras.userAgent)) return;

    await guardarEvento({
      fecha: diaCaracasISO(Date.now()),
      tipo: "atajo",
      ruta: cabeceras.ruta ?? atajo,
      detalle: atajo,
      sesion: `atajo-${crypto.randomUUID()}`,
      // El servidor no puede saber si el teléfono es táctil ni si la app está
      // instalada, y adivinarlo del user-agent sería inventarlo.
      dispositivo: null,
      instalada: false,
      referente: hostDe(cabeceras.referer),
    });
  } catch {
    // Perder el conteo de un clic no es un incidente; no llevar a nadie a
    // ninguna parte, sí.
  }
}

/** Solo el host, nunca la URL completa: mismo criterio que en el navegador. */
function hostDe(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname;
  } catch {
    return null;
  }
}

/** Una fila del desglose: una clave y cuántas veces salió. */
export interface Conteo {
  clave: string;
  total: number;
}

export interface DiaAnalitica {
  fecha: string;
  visitas: number;
  sesiones: number;
  /** Ver `sesionesSitio` en los totales: aquí, día a día. */
  sesionesSitio: number;
  conversiones: number;
  atajos: number;
}

export interface AnaliticasWeb {
  desde: string;
  hasta: string;
  totales: {
    visitas: number;
    sesiones: number;
    /**
     * Sesiones de gente **usando la app**, sin los clics en atajos.
     *
     * `sesiones` no es el número de personas: `registrarAtajo()` inventa una
     * sesión aleatoria por cada clic en `/hoy`, `/wa`, `/ig` o `/laparada`
     * —ahí no hay pestaña con la que correlacionar nada— así que el total
     * queda inflado con visitantes que precisamente se van del sitio. Medido:
     * 558 sesiones contra 333 de sitio en el mismo mes. Para mirar el uso por
     * dentro daba igual; para la cifra que se le enseña a un anunciante, no.
     */
    sesionesSitio: number;
    conversiones: number;
    copias: number;
    instalaciones: number;
    sesionesInstaladas: number;
    sesionesSinConexion: number;
    atajos: number;
    /**
     * Sesiones con al menos una conversión, y sesiones que copiaron o
     * compartieron un monto. Son de nivel sesión —un `count(distinct sesion)`
     * filtrado— así que no se pueden derivar aquí de las demás cifras: los
     * calcula la función `analiticas_web` (migración `0019`), que es la que
     * tiene la tabla delante.
     */
    sesionesQueConvierten: number;
    sesionesQueSeLlevanLaCifra: number;
  };
  serie: DiaAnalitica[];
  tipos: Conteo[];
  rutas: Conteo[];
  monedas: Conteo[];
  /** Clics en los atajos del dominio (`/hoy`, `/wa`, `/ig`, `/laparada`, `/p`). */
  atajos: Conteo[];
  /** De dónde venía el clic en un atajo: el host que lo refirió. */
  referentesAtajos: Conteo[];
  dispositivos: Conteo[];
  referentes: Conteo[];
}

/**
 * El resumen de los últimos `dias` días, agrupado **en la base**.
 *
 * La función `analiticas_web` (migración `0010`) devuelve el panel entero en
 * un solo viaje: PostgREST no agrupa, así que la alternativa era traerse
 * decenas de miles de filas a una función serverless para contarlas a mano.
 *
 * El rango se calcula aquí, en días calendario de Caracas, por el mismo
 * motivo que el resto del proyecto arma las fechas a mano: cortar el día en
 * UTC repartiría el disparo de las 18:00 entre dos días distintos.
 */
export async function leerAnaliticasWeb(dias: number): Promise<AnaliticasWeb> {
  const hasta = diaCaracasISO(Date.now());
  const desde = desplazarDia(hasta, -(dias - 1));

  return rest<AnaliticasWeb>("/rpc/analiticas_web", {
    method: "POST",
    body: JSON.stringify({ desde, hasta }),
    prefer: "return=representation",
  });
}
