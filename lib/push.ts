import webpush from "web-push";
import { formatClock, formatRate } from "@/lib/format";
import type { RatesSnapshot } from "@/lib/types";

/**
 * El aviso "ya están las tasas de hoy", sobre la tabla que crea
 * `supabase/migrations/0021_suscripciones_push.sql`.
 *
 * La app no podía llamar al usuario: todo el retorno dependía de que abriera el
 * icono o viera Instagram. Esto lo cambia, y arranca deliberadamente por lo más
 * simple que sirve:
 *
 * - **Un solo aviso, sin umbral y sin configuración.** El mismo mensaje para
 *   todos, cuando el cron publica. Un umbral por persona ("avísame si pasa de
 *   900") obliga a guardar preferencias por dispositivo, y eso es una decisión
 *   de privacidad distinta — ver la nota de la migración. Esto además responde
 *   antes la pregunta que de verdad importa: cuánta gente activa los avisos.
 * - **Lo dispara el cron que ya publica**, no uno nuevo: ese ya tiene las
 *   cifras congeladas y ya sabe que el post salió.
 *
 * Mismo patrón de acceso que `lib/tasas-pendientes.ts` y `lib/programadas.ts`:
 * `fetch` directo a PostgREST con `SUPABASE_SERVICE_ROLE_KEY`, sin el SDK.
 * Solo servidor.
 */

const TIMEOUT_MS = 10_000;
const TABLA = "suscripciones_push";

/**
 * Cuántos avisos se mandan a la vez.
 *
 * Cada envío es una petición HTTPS al servidor push del navegador, así que con
 * mil suscripciones en serie no cabría en el minuto de la función. En paralelo
 * sin tope tampoco: son mil sockets de golpe. Veinte es un número cómodo que no
 * hay que afinar hasta que la lista crezca de verdad.
 */
const POR_TANDA = 20;

export interface SuscripcionPush {
  endpoint: string;
  p256dh: string;
  auth: string;
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
 * Da de alta un dispositivo, o actualiza el suyo si ya existía.
 *
 * Es un `upsert` sobre el `endpoint` y por eso es idempotente: volver a
 * suscribirse desde el mismo navegador no deja dos filas. Sin eso, cada vez que
 * el navegador rota su suscripción quedaría una muerta acumulándose.
 */
export async function guardarSuscripcion(suscripcion: SuscripcionPush): Promise<void> {
  await rest<undefined>("", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(suscripcion),
  });
}

/** La borra cuando el usuario desactiva el aviso desde su propio dispositivo. */
export async function borrarSuscripcion(endpoint: string): Promise<void> {
  await rest<undefined>(`?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
}

async function listarSuscripciones(): Promise<SuscripcionPush[]> {
  return rest<SuscripcionPush[]>("?select=endpoint,p256dh,auth", { method: "GET" });
}

/**
 * Las claves VAPID con las que se firma cada envío.
 *
 * `null` sin configurar, y quien llama no manda nada: un despliegue sin claves
 * simplemente no avisa, igual que sin `RESEND_API_KEY` no salen los correos. No
 * es un motivo para que el cron falle.
 */
function vapid(): { publica: string; privada: string } | null {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  return publica && privada ? { publica, privada } : null;
}

export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  /** A dónde lleva al tocarlo. Ruta del propio dominio. */
  ruta: string;
}

/**
 * Manda el aviso a todos los dispositivos suscritos.
 *
 * **Nunca lanza**, y esa es la regla que hereda de `notificar()`: lo dispara el
 * cron justo después de publicar, y un aviso que no sale no puede convertir una
 * publicación correcta en un error que invite a reintentar y duplique el post.
 * Devuelve el recuento para que el cron lo anote en su respuesta.
 *
 * **Las suscripciones muertas se borran solas.** Cuando el navegador contesta
 * 404 o 410, esa suscripción ya no existe —el usuario desinstaló la app,
 * limpió los datos, cambió de teléfono— y guardarla solo haría que cada envío
 * futuro tardara más. Es la única limpieza que esta tabla necesita.
 */
export async function avisarTasasDelDia(aviso: AvisoPush): Promise<{ enviados: number; borrados: number }> {
  const claves = vapid();
  if (!claves) return { enviados: 0, borrados: 0 };

  let suscripciones: SuscripcionPush[];
  try {
    suscripciones = await listarSuscripciones();
  } catch {
    return { enviados: 0, borrados: 0 };
  }

  webpush.setVapidDetails(`mailto:${process.env.NOTIFICAR_EMAIL ?? "hola@latasa.online"}`, claves.publica, claves.privada);

  const carga = JSON.stringify(aviso);
  let enviados = 0;
  const caducadas: string[] = [];

  for (let i = 0; i < suscripciones.length; i += POR_TANDA) {
    const tanda = suscripciones.slice(i, i + POR_TANDA);

    await Promise.all(
      tanda.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            carga,
          );
          enviados += 1;
        } catch (error) {
          const codigo = (error as { statusCode?: number }).statusCode;
          if (codigo === 404 || codigo === 410) caducadas.push(s.endpoint);
        }
      }),
    );
  }

  for (const endpoint of caducadas) {
    try {
      await borrarSuscripcion(endpoint);
    } catch {
      // Se reintenta sola en el próximo envío: seguirá dando 410.
    }
  }

  return { enviados, borrados: caducadas.length };
}

/**
 * El texto del aviso, compuesto **en el servidor** desde el snapshot que se
 * acaba de publicar.
 *
 * Vive aquí y no en el service worker por la regla dura del proyecto: una cifra
 * sin la hora a la que se leyó es una tasa vieja servida como fresca. El worker
 * solo pinta lo que le llega, y si no le llega nada no inventa una notificación
 * (ver `public/sw.js`).
 *
 * **Dos tasas y no las seis.** Un cuerpo de notificación se corta a dos líneas
 * en el teléfono, así que se eligen las dos que responden la pregunta con la
 * que se abre la app: el oficial y el que de verdad se paga. El resto está a un
 * toque de distancia, que es justo a donde lleva el aviso.
 *
 * Se usan los mismos `formatRate` y `formatClock` que la imagen y el caption:
 * las tres piezas del mismo disparo no pueden decir cifras distintas.
 */
export function avisoDeTasas(snapshot: RatesSnapshot, momento: "manana" | "tarde"): AvisoPush {
  const bcv = snapshot.rates.USD_BCV.bsPerUnit;
  const binance = snapshot.rates.USD_BINANCE_SELL.bsPerUnit;

  const lineas = [
    bcv === null ? null : `Dólar BCV ${formatRate(bcv)} Bs`,
    binance === null ? null : `Binance venta ${formatRate(binance)} Bs`,
  ].filter(Boolean);

  return {
    titulo: momento === "manana" ? "Tasas de la mañana" : "Tasas de la tarde",
    // Sin ninguna de las dos no se inventa un cuerpo: se dice que hay tasas
    // nuevas y punto, que es lo único cierto en ese caso.
    cuerpo: lineas.length
      ? `${lineas.join(" · ")} — lectura de las ${formatClock(snapshot.fetchedAt)}`
      : `Publicadas a las ${formatClock(snapshot.fetchedAt)}`,
    ruta: "/",
  };
}
