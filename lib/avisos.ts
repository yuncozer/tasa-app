"use client";

/**
 * Si este navegador puede recibir avisos push.
 *
 * Mismo patrón y mismo motivo que `lib/portapapeles.ts` y `lib/compartir.ts`:
 * se consulta con `useSyncExternalStore` porque en el servidor no existe
 * `navigator`, y declarar aparte el valor del servidor es lo que evita el
 * desajuste de hidratación.
 *
 * **En iPhone solo funciona con la app instalada** en la pantalla de inicio
 * (iOS 16.4+, y lo confirma la guía de PWA de Next). Ahí `PushManager` ni
 * siquiera existe en una pestaña de Safari, así que esta comprobación ya cubre
 * ese caso sin tener que detectar el sistema operativo: donde no se puede, el
 * botón no se pinta — un botón que nunca funciona es peor que ninguno.
 */

export const sinCambios = () => () => {};
export const noEnServidor = () => false;

let cache: boolean | undefined;

export function hayAvisos(): boolean {
  if (cache !== undefined) return cache;

  try {
    cache =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      typeof Notification.requestPermission === "function";
  } catch {
    cache = false;
  }

  return cache;
}

/**
 * La clave pública VAPID, en el formato de bytes que pide `subscribe()`.
 *
 * Va en base64url y el navegador la quiere como `Uint8Array`. Es pública por
 * diseño —viaja al navegador, de ahí el prefijo `NEXT_PUBLIC_`—: sirve para
 * que el servidor push compruebe que el aviso lo firmó quien dice, no para
 * mandar nada.
 */
function claveAplicacion(): ArrayBuffer | null {
  const base64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!base64) return null;

  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normalizada);

  // Se devuelve el `ArrayBuffer` y no el `Uint8Array`: `applicationServerKey`
  // acepta un `BufferSource`, y el tipo de `Uint8Array` en TypeScript admite
  // también un `SharedArrayBuffer` por debajo, que ahí no encaja. Es lo mismo
  // en tiempo de ejecución.
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);

  return bytes.buffer;
}

/** La suscripción de este dispositivo, si ya la tenía. */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  try {
    const registro = await navigator.serviceWorker.ready;
    return await registro.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Pide permiso, se suscribe y lo registra en el servidor.
 *
 * **El permiso se pide al pulsar, nunca al abrir la pantalla.** Es la misma
 * regla que el portapapeles: un diálogo de permiso que salta al entrar se
 * rechaza por reflejo, y en Safari además es lo que exige el navegador para
 * concederlo. Y una vez denegado no hay segunda oportunidad desde el código.
 *
 * Devuelve `false` sin ruido si el usuario dice que no: negarse no es un error.
 */
export async function activarAvisos(): Promise<boolean> {
  const clave = claveAplicacion();
  if (!clave) return false;

  try {
    if ((await Notification.requestPermission()) !== "granted") return false;

    const registro = await navigator.serviceWorker.ready;
    const suscripcion =
      (await registro.pushManager.getSubscription()) ??
      (await registro.pushManager.subscribe({
        // Obligatorio en todos los navegadores actuales: el aviso siempre se
        // muestra al usuario, no puede haber push silencioso.
        userVisibleOnly: true,
        applicationServerKey: clave,
      }));

    const respuesta = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(suscripcion),
    });

    // Si el servidor no la guardó, la suscripción del navegador sobra: sin fila
    // no llega ningún aviso, y dejarla haría que el botón dijera "activado"
    // para siempre sin que nunca sonara nada.
    if (!respuesta.ok) {
      await suscripcion.unsubscribe();
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/** Da de baja este dispositivo, en el navegador y en el servidor. */
export async function desactivarAvisos(): Promise<boolean> {
  try {
    const suscripcion = await suscripcionActual();
    if (!suscripcion) return true;

    // Primero el servidor: si se cancela en el navegador y luego falla la
    // llamada, la fila se queda huérfana mandando avisos a un endpoint muerto
    // hasta que uno de ellos devuelva 410.
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: suscripcion.endpoint }),
    });

    await suscripcion.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
