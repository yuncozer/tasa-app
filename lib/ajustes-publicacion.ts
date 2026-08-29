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
 * - `completo`: el carrusel de feed **y** las dos Historias.
 * - `solo_carrusel`: el carrusel sin Historias.
 * - `solo_historias`: las Historias sin el carrusel — sirve para los días en
 *   que la cuadrícula del perfil ya tiene bastante pero se quiere seguir
 *   avisando de que hay tasas nuevas.
 * - `apagado`: ese disparo no publica nada.
 *
 * Los cuatro son combinaciones de dos piezas (carrusel y Historias), y se
 * nombran en vez de exponer dos interruptores porque así es como se decide:
 * "hoy solo historias", no "hoy carrusel no e historias sí".
 */
export type ModoPublicacion = "completo" | "solo_carrusel" | "solo_historias" | "apagado";

export type AjustesDia = Record<Momento, ModoPublicacion>;

/**
 * Qué publica cada disparo cuando nadie ha tocado nada.
 *
 * La rutina de la cuenta no es la misma toda la semana, y hasta ahora esa
 * diferencia vivía **solo en cron-job.org** —la tarea de las 9:00 no estaba
 * activada los fines de semana— donde el código no podía verla: la agenda de
 * `/admin` daba por fallido el post de la mañana todos los sábados, y el
 * panel ofrecía "apagar" algo que ese día no iba a salir de todos modos.
 * Ahora la regla vive aquí y el cron puede dispararse todos los días: si
 * toca no publicar, esta función lo dice.
 *
 * - **Lunes a viernes**: por la mañana el carrusel con sus Historias, y por
 *   la tarde solo el carrusel — dos juegos de Historias idénticos el mismo
 *   día saturan a quien mira.
 * - **Sábado y domingo**: por la mañana nada, y por la tarde el carrusel con
 *   sus Historias. El fin de semana la gente mira el teléfono más tarde, y
 *   una sola publicación al día basta.
 */
export function modoPorDefecto(fecha: string, momento: Momento): ModoPublicacion {
  // El día de la semana se calcula sobre la fecha ya resuelta en Caracas
  // (`diaCaracasISO`), así que aquí se lee como UTC a propósito: no hay hora
  // que convertir, la conversión ya se hizo al formar la fecha.
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  const finDeSemana = dia === 0 || dia === 6;

  if (finDeSemana) return momento === "manana" ? "apagado" : "completo";
  return momento === "manana" ? "completo" : "solo_carrusel";
}

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
  return (
    valor === "completo" ||
    valor === "solo_carrusel" ||
    valor === "solo_historias" ||
    valor === "apagado"
  );
}

/**
 * Cómo está configurado cada disparo de esa fecha: lo que el admin haya
 * elegido para hoy y, donde no haya elegido nada, lo que toque por el día de
 * la semana (`modoPorDefecto`).
 */
export async function leerAjustesDia(fecha: string): Promise<AjustesDia> {
  const filas = await rest<FilaAjuste[]>(`?fecha=eq.${fecha}&select=momento,modo`, {
    method: "GET",
    prefer: "return=representation",
  });

  const ajustes: AjustesDia = {
    manana: modoPorDefecto(fecha, "manana"),
    tarde: modoPorDefecto(fecha, "tarde"),
  };
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
    return { manana: modoPorDefecto(fecha, "manana"), tarde: modoPorDefecto(fecha, "tarde") };
  }
}

/** Qué piezas publica un modo. Lo consulta `publicarTasasDelDia()`. */
export function piezasDe(modo: ModoPublicacion): { carrusel: boolean; historias: boolean } {
  return {
    carrusel: modo === "completo" || modo === "solo_carrusel",
    historias: modo === "completo" || modo === "solo_historias",
  };
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
