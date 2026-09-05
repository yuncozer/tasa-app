import { claveDeIp, registrar } from "@/lib/limite-intentos";
import { borrarSuscripcion, guardarSuscripcion } from "@/lib/push";

/**
 * Alta y baja de los avisos "ya están las tasas de hoy".
 *
 * Es la **segunda** ruta pública que escribe en Supabase, después de
 * `/api/eventos`, y hereda de ella las dos defensas: techo por IP y descarte de
 * lo que el navegador declara como cross-site. Ninguna es autenticación —aquí
 * no puede haberla, la llama el navegador de cualquier visitante— y las dos
 * cortan el bucle barato, que es de lo que se trata.
 *
 * Se diferencia de `/api/eventos` en una cosa: **aquí sí se contesta un error**.
 * Allí quien llama es un `sendBeacon` que no mira la respuesta, así que un 4xx
 * solo servía de oráculo; aquí hay una persona que acaba de pulsar un botón y
 * espera ver si quedó activado. Un fallo silencioso dejaría el interruptor
 * encendido sin que llegue nunca un aviso.
 */

/**
 * Suscribirse es algo que se hace una vez, no cada minuto. Diez por IP y hora
 * deja sitio de sobra para un local con wifi compartido y para quien active y
 * desactive probando, y corta cualquier bucle.
 */
const MAX_POR_HORA = 10;
const VENTANA_MS = 60 * 60 * 1000;

const SIN_CACHE = { "Cache-Control": "no-store" } as const;

/** Mismo criterio y mismas dos cabeceras que `/api/eventos`. */
function vieneDeLaApp(request: Request): boolean {
  const sitio = request.headers.get("sec-fetch-site");
  if (sitio && sitio !== "same-origin" && sitio !== "same-site" && sitio !== "none") return false;

  const origen = request.headers.get("origin");
  if (!origen) return true;

  try {
    return new URL(origen).hostname === new URL(request.url).hostname;
  } catch {
    return false;
  }
}

function json(cuerpo: unknown, status = 200): Response {
  return Response.json(cuerpo, { status, headers: SIN_CACHE });
}

/**
 * Lee lo que manda `PushManager.subscribe()`, que es un objeto del navegador y
 * no algo que este código controle. Se valida a mano por lo mismo que
 * `normalizarEvento()`: es una ruta pública y lo que entra tiene que estar
 * acotado antes de tocar la base.
 */
function suscripcionValida(cuerpo: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  const dato = cuerpo as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = dato?.endpoint;
  const p256dh = dato?.keys?.p256dh;
  const auth = dato?.keys?.auth;

  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;

  // El endpoint lo emite el servidor push del navegador y siempre es https.
  // Comprobarlo evita que una petición armada a mano meta cualquier cadena en
  // una columna que luego se usa para hacer peticiones salientes.
  if (!endpoint.startsWith("https://") || endpoint.length > 1000) return null;
  if (p256dh.length > 200 || auth.length > 200) return null;

  return { endpoint, p256dh, auth };
}

export async function POST(request: Request): Promise<Response> {
  if (!vieneDeLaApp(request)) return json({ ok: false }, 403);
  if (!registrar(claveDeIp(request, "push"), MAX_POR_HORA, VENTANA_MS).permitido) {
    return json({ ok: false, motivo: "demasiadas_peticiones" }, 429);
  }

  let suscripcion: ReturnType<typeof suscripcionValida>;
  try {
    suscripcion = suscripcionValida(await request.json());
  } catch {
    suscripcion = null;
  }

  if (!suscripcion) return json({ ok: false, motivo: "suscripcion_invalida" }, 400);

  try {
    await guardarSuscripcion(suscripcion);
  } catch {
    // El detalle no sale, igual que en `apiError`: quien pulsó el botón no
    // puede hacer nada con el cuerpo que devolvió PostgREST.
    return json({ ok: false, motivo: "no_se_pudo_guardar" }, 502);
  }

  return json({ ok: true });
}

/**
 * La baja la pide el propio dispositivo con su endpoint. No hace falta
 * autenticar nada: conocer el endpoint **es** ser ese dispositivo, y lo único
 * que se puede hacer con él es dejar de recibir avisos.
 */
export async function DELETE(request: Request): Promise<Response> {
  if (!vieneDeLaApp(request)) return json({ ok: false }, 403);
  if (!registrar(claveDeIp(request, "push"), MAX_POR_HORA, VENTANA_MS).permitido) {
    return json({ ok: false, motivo: "demasiadas_peticiones" }, 429);
  }

  let endpoint: unknown;
  try {
    endpoint = (await request.json())?.endpoint;
  } catch {
    endpoint = null;
  }

  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return json({ ok: false, motivo: "endpoint_invalido" }, 400);
  }

  try {
    await borrarSuscripcion(endpoint);
  } catch {
    return json({ ok: false, motivo: "no_se_pudo_borrar" }, 502);
  }

  return json({ ok: true });
}
