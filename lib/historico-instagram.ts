/**
 * El histórico de seguidores, que la Graph API no guarda.
 *
 * `followers_count` es un número instantáneo: Meta no expone cuántos
 * seguidores había hace una semana. Sin memoria propia, la cifra del panel es
 * muda —200 seguidores no dice nada sin saber si eran 180 o 220 hace un mes—
 * así que se anota una vez al día y de ahí sale el crecimiento.
 *
 * Lo escribe el cron del resumen diario, que ya lee el perfil para el correo:
 * así no hay una llamada más a la Graph API solo para esto, ni una escritura
 * por visita al panel — la misma regla que ya prohíbe registrar el histórico
 * de tasas dentro de `getRates()`.
 *
 * Solo servidor: la `service_role` de Supabase salta el RLS.
 */

import { diaCaracasISO } from "@/lib/format";
import { desplazarDia } from "@/lib/historico";

const TIMEOUT_MS = 10_000;
const TABLA = "historico_instagram";

/** Cuántos días a cada lado del objetivo se aceptan si falta el día exacto. */
const VENTANA_DIAS = 3;

interface FilaHistorico {
  fecha: string;
  seguidores: number;
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

/**
 * Anota los seguidores de hoy. Idempotente: la clave primaria es la fecha, así
 * que dos disparos el mismo día se sobreescriben en vez de duplicar.
 *
 * Nunca lanza: es un registro de conveniencia dentro de un cron que tiene otro
 * trabajo que hacer, y perder un día de histórico no puede tumbarlo.
 */
export async function registrarSeguidores(
  seguidores: number | null,
  publicaciones: number | null,
): Promise<void> {
  if (typeof seguidores !== "number") return;

  try {
    await rest("?on_conflict=fecha", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({
        fecha: diaCaracasISO(Date.now()),
        seguidores,
        publicaciones,
        registrado_en: new Date().toISOString(),
      }),
    });
  } catch {
    // Un día sin anotar solo deja un hueco en la comparación, y la ventana de
    // tolerancia de `crecimientoSeguidores()` ya lo absorbe.
  }
}

export interface CrecimientoSeguidores {
  /** Lo que había hace `dias` días, o `null` si no hay registro en la ventana. */
  anterior: number | null;
  /** La fecha del registro que se usó como referencia. */
  fechaAnterior: string | null;
}

/**
 * Cuántos seguidores había hace `dias` días.
 *
 * Se acepta el registro más cercano dentro de ±3 días, igual que
 * `leerComparativa()` en el reporte semanal: si el cron falló justo ese día,
 * el de al lado sirve y está mucho más cerca que no comparar nada.
 *
 * Nunca lanza: sin histórico no hay comparación, y eso la interfaz lo sabe
 * mostrar.
 */
export async function crecimientoSeguidores(dias: number): Promise<CrecimientoSeguidores> {
  try {
    const objetivo = desplazarDia(diaCaracasISO(Date.now()), -dias);
    const desde = desplazarDia(objetivo, -VENTANA_DIAS);
    const hasta = desplazarDia(objetivo, VENTANA_DIAS);

    const filas = await rest<FilaHistorico[]>(
      `?fecha=gte.${desde}&fecha=lte.${hasta}&select=fecha,seguidores&order=fecha.asc`,
      { method: "GET", prefer: "return=representation" },
    );

    if (!filas?.length) return { anterior: null, fechaAnterior: null };

    // La más cercana al objetivo; en empate gana la más antigua, para que la
    // comparación no se acorte por debajo del período pedido.
    const elegida = filas.reduce((mejor, fila) =>
      Math.abs(Date.parse(fila.fecha) - Date.parse(objetivo)) <
      Math.abs(Date.parse(mejor.fecha) - Date.parse(objetivo))
        ? fila
        : mejor,
    );

    return { anterior: elegida.seguidores, fechaAnterior: elegida.fecha };
  } catch {
    return { anterior: null, fechaAnterior: null };
  }
}
