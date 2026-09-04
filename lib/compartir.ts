"use client";

/**
 * Si este navegador deja compartir **archivos** con el selector del sistema.
 *
 * Mismo patrón y mismo motivo que `lib/portapapeles.ts`: se consulta con
 * `useSyncExternalStore` porque en el servidor no existe `navigator`, y
 * declarar aparte el valor del servidor es lo que evita el desajuste de
 * hidratación. No hay a qué suscribirse —la capacidad no cambia mientras la
 * página vive—, de ahí la baja vacía.
 *
 * Se comprueba `canShare` con un archivo de verdad y no solo la existencia de
 * `navigator.share`: hay navegadores que comparten texto pero no archivos, y
 * ahí el botón fallaría justo al pulsarlo. La regla de la casa es que **un
 * botón que nunca funciona es peor que ninguno**, así que donde no se puede,
 * no se pinta.
 */

export const sinCambios = () => () => {};

export const noEnServidor = () => false;

/**
 * El resultado se memoriza porque `getSnapshot` tiene que devolver siempre el
 * mismo valor mientras nada cambie, o React vuelve a renderizar sin fin —el
 * mismo cuidado que documenta `lib/preferencia-moneda.ts`—. Y la comprobación
 * construye un `File`, que no es gratis.
 */
let cache: boolean | undefined;

export function haySelectorDeArchivos(): boolean {
  if (cache !== undefined) return cache;

  try {
    if (typeof navigator?.share !== "function" || typeof navigator.canShare !== "function") {
      cache = false;
    } else {
      const prueba = new File([new Uint8Array(1)], "prueba.png", { type: "image/png" });
      cache = navigator.canShare({ files: [prueba] });
    }
  } catch {
    // Safari en modos restringidos puede lanzar al construir el File.
    cache = false;
  }

  return cache;
}
