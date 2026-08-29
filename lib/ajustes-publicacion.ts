/**
 * Qué se publica en cada disparo automático de hoy.
 *
 * El carrusel de tasas sale por cron dos veces al día, y hasta ahora la única
 * forma de saltarse uno era desactivar la tarea en cron-job.org — con el
 * riesgo de dejarla apagada para siempre. Esto lo resuelve desde `/admin/hoy`
 * y **solo para el día en curso**.
 *
 * Dos decisiones que hacen que esto no pueda dejar la cuenta muda:
 *
 * - **El ajuste caduca solo.** La clave lleva la fecha, así que apagar el
 *   post de hoy no dice nada de mañana: mañana no hay fila y se publica como
 *   siempre. Un interruptor permanente sería justo el que alguien deja
 *   apagado sin querer.
 * - **La ausencia de fila es "completo".** No hay estado que inicializar ni
 *   que mantener: lo normal no se guarda, solo la excepción.
 *
 * Solo servidor: la `service_role` de Supabase salta el RLS.
 */

import type { Momento } from "@/lib/tasas-pendientes";

const TIMEOUT_MS = 10_000;
const TABLA = "ajustes_publicacion";

/**
 * - `completo`: el carrusel y, en la mañana, sus dos Historias.
 * - `solo_historias`: las Historias sin el carrusel de feed — sirve para los
 *   días en que la cuadrícula del perfil ya tiene bastante pero se quiere
 *   seguir avisando de que hay tasas nuevas.
 * - `apagado`: ese disparo no publica nada.
 */
export type ModoPublicacion = "completo" | "solo_historias" | "apagado";

export const MODO_POR_DEFECTO: ModoPublicacion = "completo";

export type AjustesDia = Record<Momento, ModoPublicacion>;

interface FilaAjuste {
  momento: string;
  modo: string;
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

function esModo(valor: string): valor is ModoPublicacion {
  return valor === "completo" || valor === "solo_historias" || valor === "apagado";
}

/**
 * Cómo está configurado cada disparo de esa fecha. Lo que no tenga fila sale
 * como `completo`, que es lo que hace el cron cuando nadie ha tocado nada.
 */
export async function leerAjustesDia(fecha: string): Promise<AjustesDia> {
  const filas = await rest<FilaAjuste[]>(`?fecha=eq.${fecha}&select=momento,modo`, {
    method: "GET",
    prefer: "return=representation",
  });

  const ajustes: AjustesDia = { manana: MODO_POR_DEFECTO, tarde: MODO_POR_DEFECTO };
  for (const fila of filas ?? []) {
    if ((fila.momento === "manana" || fila.momento === "tarde") && esModo(fila.modo)) {
      ajustes[fila.momento] = fila.modo;
    }
  }
  return ajustes;
}

/**
 * Nunca lanza: es una lectura de conveniencia y el cron no puede dejar de
 * publicar porque Supabase no respondiera — ante la duda se publica, que es
 * el comportamiento de siempre y el que no deja a la cuenta en silencio.
 */
export async function leerAjustesDiaSeguro(fecha: string): Promise<AjustesDia> {
  try {
    return await leerAjustesDia(fecha);
  } catch {
    return { manana: MODO_POR_DEFECTO, tarde: MODO_POR_DEFECTO };
  }
}

export async function guardarAjusteDia(
  fecha: string,
  momento: Momento,
  modo: ModoPublicacion,
): Promise<void> {
  await rest("?on_conflict=fecha,momento", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ fecha, momento, modo, actualizado_en: new Date().toISOString() }),
  });
}
