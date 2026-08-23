/**
 * Render del video en la nube de HeyGen, por HTTP y sin el CLI.
 *
 * El generador de `/admin` tiene que funcionar **desde el teléfono**, y ahí lo
 * sirve Vercel: una función serverless donde no hay Chromium ni `ffmpeg` ni
 * sitio para el CLI de HyperFrames. Es la misma restricción que llevó a marcar
 * los videos en Cloudinary en vez de aquí, y la respuesta es la misma: el
 * trabajo pesado lo hace un servicio de fuera y nosotros solo lo pedimos.
 *
 * El esquema no está adivinado: sale del cliente del propio CLI
 * (`hyperframes/dist/cli.js`) — cabecera `x-api-key`, `POST
 * /v3/hyperframes/renders` con `project.asset_id` y `variables`, y
 * `GET /v3/hyperframes/renders/{id}` hasta un estado terminal.
 *
 * **La plantilla se sube una sola vez** y se guarda su `asset_id` en
 * `HYPERFRAMES_ASSET_ID`. Cada generación reenvía solo las variables del día,
 * así que no viaja ningún archivo desde Vercel — que es lo que hace viable
 * todo esto dentro del minuto de una función.
 */

const BASE = process.env.HEYGEN_API_URL?.replace(/\/+$/, "") ?? "https://api.heygen.com";
const TIMEOUT_MS = 20_000;

/** Los mismos que trata como finales el CLI (`TERMINAL_STATUSES`). */
const ESTADOS_FINALES = new Set(["completed", "failed"]);

export interface EstadoRender {
  estado: "pendiente" | "listo" | "fallido";
  /** URL firmada del MP4, solo cuando está listo. Es efímera. */
  videoUrl?: string;
  error?: string;
}

function credenciales(): { key: string; assetId: string } {
  const key = process.env.HEYGEN_API_KEY;
  const assetId = process.env.HYPERFRAMES_ASSET_ID;
  if (!key || !assetId) {
    throw new Error("Faltan HEYGEN_API_KEY o HYPERFRAMES_ASSET_ID");
  }
  return { key, assetId };
}

/** `true` si el render en la nube está configurado en este entorno. */
export function nubeConfigurada(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY && process.env.HYPERFRAMES_ASSET_ID);
}

async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const { key } = credenciales();

  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "x-api-key": key,
      // La misma que manda el CLI; identifica de qué cliente viene la petición.
      "X-HeyGen-Client-Source": "hyperframes",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!respuesta.ok) {
    const detalle = (await respuesta.text().catch(() => "")).slice(0, 300);
    throw new Error(`HeyGen respondió ${respuesta.status}${detalle ? `: ${detalle}` : ""}`);
  }

  const json = (await respuesta.json()) as unknown;
  // La API envuelve unas respuestas en `data` y otras no; se acepta cualquiera
  // de las dos formas en vez de asumir una.
  const cuerpo = json as { data?: unknown };
  return (cuerpo?.data ?? json) as T;
}

/**
 * Encola el render y devuelve su identificador, **sin esperar**.
 *
 * No espera a propósito: el render tarda cerca de un minuto y una función de
 * Vercel muere justo ahí. La interfaz pregunta después por el estado, igual que
 * la cola de programadas avanza por fases en vez de intentarlo todo de un
 * tirón.
 */
export async function encolarRender(
  variables: Record<string, string | number>,
): Promise<string> {
  const { assetId } = credenciales();

  const respuesta = await api<{ render_id?: string }>("/v3/hyperframes/renders", {
    method: "POST",
    body: JSON.stringify({
      project: { type: "asset_id", asset_id: assetId },
      composition: "index.html",
      // Los mismos parámetros con los que se renderiza en local, para que lo
      // que sale de la nube y lo que sale del portátil sean el mismo video.
      fps: 30,
      quality: "high",
      format: "mp4",
      resolution: "1080p",
      aspect_ratio: "9:16",
      variables,
    }),
  });

  if (!respuesta.render_id) throw new Error("HeyGen no devolvió un render_id");
  return respuesta.render_id;
}

/** En qué anda un render encolado. */
export async function estadoRender(renderId: string): Promise<EstadoRender> {
  const detalle = await api<{ status?: string; video_url?: string; error?: unknown }>(
    `/v3/hyperframes/renders/${encodeURIComponent(renderId)}`,
  );

  const estado = detalle.status ?? "";

  if (!ESTADOS_FINALES.has(estado)) return { estado: "pendiente" };

  if (estado === "failed") {
    const error = typeof detalle.error === "string" ? detalle.error : "El render falló en HeyGen";
    return { estado: "fallido", error };
  }

  if (!detalle.video_url) {
    return { estado: "fallido", error: "El render terminó pero HeyGen no devolvió el video" };
  }

  return { estado: "listo", videoUrl: detalle.video_url };
}
