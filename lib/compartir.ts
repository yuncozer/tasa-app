"use client";

import { formatAmount, formatClock, formatDate } from "@/lib/format";
import { destinoPrincipal } from "@/lib/convert";
import { rateMeta } from "@/lib/rates";
import type { ConversionResult, RateKey } from "@/lib/types";

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
 * Los resultados se memorizan porque `getSnapshot` tiene que devolver siempre
 * el mismo valor mientras nada cambie, o React vuelve a renderizar sin fin —el
 * mismo cuidado que documenta `lib/preferencia-moneda.ts`—. Y cada comprobación
 * construye un `File`, que no es gratis.
 */
let cacheArchivos: boolean | undefined;
let cacheConTexto: boolean | undefined;

function archivoDePrueba(): File {
  return new File([new Uint8Array(1)], "prueba.png", { type: "image/png" });
}

function haySelector(): boolean {
  return typeof navigator?.share === "function" && typeof navigator.canShare === "function";
}

export function haySelectorDeArchivos(): boolean {
  if (cacheArchivos !== undefined) return cacheArchivos;

  try {
    cacheArchivos = haySelector() && navigator.canShare({ files: [archivoDePrueba()] });
  } catch {
    // Safari en modos restringidos puede lanzar al construir el File.
    cacheArchivos = false;
  }

  return cacheArchivos;
}

/**
 * Si además del archivo acepta **texto en la misma llamada**.
 *
 * Se comprueba aparte de `haySelectorDeArchivos()` y no como una condición más
 * dentro de ella: hay navegadores que aceptan archivos pero rechazan la
 * combinación, y `canShare` solo responde por la carga exacta que se le pasa.
 * Sin esta segunda comprobación, `share()` lanzaría justo al pulsar el botón en
 * los navegadores donde hoy funciona.
 *
 * Que sean dos preguntas distintas es lo que permite degradar en vez de
 * desaparecer: la **visibilidad** del botón la sigue decidiendo la primera, y
 * esta solo decide si el mensaje lleva pie de texto o va solo con la imagen.
 */
export function puedeCompartirConTexto(): boolean {
  if (cacheConTexto !== undefined) return cacheConTexto;

  try {
    cacheConTexto =
      haySelector() && navigator.canShare({ files: [archivoDePrueba()], text: "prueba" });
  } catch {
    cacheConTexto = false;
  }

  return cacheConTexto;
}

/**
 * El pie de texto que viaja junto a la imagen de una conversión.
 *
 * La imagen ya lleva el dominio y el `@latasa.online` dibujados en su pie
 * (`Pie` en `lib/og-shared.tsx`), pero **eso no se puede pulsar**: quien recibe
 * la cifra por WhatsApp no tiene forma de llegar a la app. Este texto es lo que
 * convierte una imagen bonita en una visita.
 *
 * Tres decisiones:
 *
 * - **Un solo enlace, y es la calculadora.** Quien acaba de recibir "100 $ =
 *   80.739 Bs" se pregunta "¿y 250?", y ese es el enlace que se pulsa. Una
 *   invitación al canal pegada al favor que le hizo un amigo se lee como
 *   publicidad; y dos enlaces convierten el mensaje en promoción, que es lo que
 *   hace que deje de reenviarse — y el reenvío es todo el valor de esto. Las
 *   redes crecen igual un paso después, porque `SocialCTA` está justo debajo de
 *   la calculadora a la que lleva.
 * - **Repite la cifra a propósito.** En un chat el texto se busca y se copia,
 *   cosa que una imagen no, y si algún destino se quedara solo con una de las
 *   dos piezas el mensaje sigue sirviendo.
 *
 *   Esa segunda mitad era el riesgo que se temía y **no se cumple donde más
 *   importaba**: comprobado en un iPhone real, WhatsApp adjunta la imagen *y*
 *   carga el texto. Se anotó porque lo contrario es lo que uno espera —el
 *   selector entrega las dos cosas y cada app decide qué usar— y sin este dato
 *   alguien acabaría reescribiendo esto para resolver un problema que no
 *   existe.
 * - **Lleva fecha y hora.** Una cifra sin fecha reenviada tres semanas después
 *   es una tasa vieja servida como fresca, que es el único daño real que esta
 *   app puede causar. Se formatean con los mismos `formatDate`/`formatClock`
 *   que usa la imagen, para que las dos digan lo mismo.
 *
 * El formato —emoji, etiqueta, salto de línea, `👉 ` y la URL absoluta— es el
 * de `pieEnlaces()` en `lib/caption.ts`, que es como se ven ya los mensajes del
 * canal.
 */
export function textoParaCompartir(datos: {
  conversion: ConversionResult;
  fetchedAt: string;
  sitio: string;
}): string | null {
  const { conversion, fetchedAt, sitio } = datos;

  const destino = destinoPrincipal(conversion);

  // Con todas las tasas caídas, `destinoPrincipal` cae al bolívar y el resumen
  // sería "X Bs = X Bs". Ahí se comparte solo la imagen, que sí sabe decir "no
  // disponible" fila por fila.
  if (destino === conversion.from) return null;

  const valor = destino === "VES" ? conversion.bs : conversion.results[destino];
  if (valor === null) return null;

  const cifra = (monto: number, clave: RateKey) =>
    `${formatAmount(monto, clave)} ${rateMeta(clave).shortLabel}`;

  return [
    `💱 ${cifra(conversion.amount, conversion.from)} = ${cifra(valor, destino)}`,
    `🕒 Tasa del ${formatDate(fetchedAt)}, ${formatClock(fetchedAt)}`,
    "",
    "🧮 Convierte cualquier monto:",
    `👉 ${sitio}`,
  ].join("\n");
}
