"use client";

/**
 * Si este navegador deja **leer** el portapapeles.
 *
 * Se consulta con `useSyncExternalStore` y no en el render porque en el
 * servidor no existe `navigator`: declarar aparte el valor del servidor es lo
 * que evita el desajuste de hidratación. No hay a qué suscribirse —la
 * capacidad no cambia mientras la página vive—, de ahí la baja vacía.
 *
 * Vive suelto porque lo usan dos pantallas muy distintas: el botón "Pegar" de
 * la calculadora y el de la URL en `/admin/noticia`. La regla que comparten es
 * la que justifica todo esto: **un botón que nunca funciona es peor que
 * ninguno**, así que donde no se puede leer el portapapeles, el botón no se
 * pinta.
 */

export const sinCambios = () => () => {};

export const hayPortapapeles = () => typeof navigator?.clipboard?.readText === "function";

export const noEnServidor = () => false;
