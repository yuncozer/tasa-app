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
  "conversion",
  "copiar",
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

/** Una fila del desglose: una clave y cuántas veces salió. */
export interface Conteo {
  clave: string;
  total: number;
}

export interface DiaAnalitica {
  fecha: string;
  visitas: number;
  sesiones: number;
  conversiones: number;
}

export interface AnaliticasWeb {
  desde: string;
  hasta: string;
  totales: {
    visitas: number;
    sesiones: number;
    conversiones: number;
    copias: number;
    instalaciones: number;
    sesionesInstaladas: number;
    sesionesSinConexion: number;
  };
  serie: DiaAnalitica[];
  tipos: Conteo[];
  rutas: Conteo[];
  monedas: Conteo[];
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
