/**
 * Qué recomendación quiere ver el usuario: la del interior (dólares y
 * bolívares) o la de frontera (pesos).
 *
 * La elige él con un toque, y se recuerda entre visitas. No se adivina por
 * ubicación: el GPS obliga a un diálogo de permiso solo para un consejo, y la
 * IP en Venezuela sale casi siempre por Caracas —justo quien vive en la
 * frontera aparecería como del interior—. Mientras no elija, se deduce del uso
 * (ver `zonaDeducida`).
 *
 * Mismo patrón que `lib/preferencia-moneda.ts`: `localStorage` envuelto en
 * `try/catch` porque Safari en privado lanza al tocarlo, y lectura memorizada
 * porque `getSnapshot` tiene que devolver el mismo valor mientras nada cambie.
 */

import type { Zona } from "@/lib/recomendacion";
import type { RateKey } from "@/lib/types";

const CLAVE = "latasa:zona-recomendacion";

let cache: Zona | null = null;
let leido = false;
const oyentes = new Set<() => void>();

function leer(): Zona | null {
  try {
    const guardado = localStorage.getItem(CLAVE);
    return guardado === "interior" || guardado === "frontera" ? guardado : null;
  } catch {
    return null;
  }
}

export function zonaGuardada(): Zona | null {
  if (!leido) {
    cache = leer();
    leido = true;
  }
  return cache;
}

export function guardarZona(zona: Zona): void {
  cache = zona;
  leido = true;
  try {
    localStorage.setItem(CLAVE, zona);
  } catch {
    // Sin almacenamiento vale para esta sesión.
  }
  for (const oyente of oyentes) oyente();
}

export function suscribirZona(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  return () => {
    oyentes.delete(alCambiar);
  };
}

export const zonaEnServidor = (): Zona | null => null;

/**
 * Sin elección guardada: quien calcula desde pesos es de frontera; el resto
 * arranca en interior, que es la versión más simple y la de la mayoría.
 */
export function zonaDeducida(origen: RateKey): Zona {
  return origen === "COP_OFICIAL" || origen === "COP_FRONTERA" ? "frontera" : "interior";
}
