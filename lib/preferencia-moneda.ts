/**
 * La moneda con la que el usuario suele empezar a calcular, recordada entre
 * visitas.
 *
 * Quien usa esto a diario parte casi siempre de la misma base —un negocio de
 * la frontera no cambia de moneda cada mañana— y volver a `USD_BCV` en cada
 * recarga obliga a repetir el mismo toque una y otra vez.
 *
 * Se guarda **solo la moneda, no el monto**: una cifra vieja reaparecida en la
 * pantalla se confunde con el resultado de ahora, que es justo lo que esta app
 * no puede permitirse.
 *
 * El valor vive fuera de React porque lo produce el navegador, así que se lee
 * con `useSyncExternalStore` igual que el estado de instalación en
 * `components/InstallPrompt.tsx`: eso da un valor propio para el servidor y
 * evita tanto el desajuste de hidratación como el `setState` dentro de un
 * efecto que el proyecto ya evita en otros sitios.
 */

import { RATE_ORDER } from "@/lib/rates";
import type { RateKey } from "@/lib/types";

const CLAVE = "latasa:moneda-origen";

let cache: RateKey | null = null;
let leido = false;
const oyentes = new Set<() => void>();

function esRateKey(valor: string | null): valor is RateKey {
  return valor !== null && (RATE_ORDER as string[]).includes(valor);
}

/**
 * Safari en navegación privada puede lanzar al tocar `localStorage`, y esto se
 * lee desde `getSnapshot`: una excepción ahí tumbaría el render de la página.
 */
function leer(): RateKey | null {
  try {
    const guardado = localStorage.getItem(CLAVE);
    // Se valida contra `RATE_ORDER` en vez de confiar en lo almacenado: una
    // moneda retirada del proyecto dejaría aquí una clave que ya no existe, y
    // el resto de la app la daría por buena.
    return esRateKey(guardado) ? guardado : null;
  } catch {
    return null;
  }
}

/**
 * `useSyncExternalStore` exige que `getSnapshot` devuelva siempre el mismo
 * valor mientras nada cambie, así que la lectura se memoriza: sin esto React
 * volvería a renderizar sin fin.
 */
export function monedaGuardada(): RateKey | null {
  if (!leido) {
    cache = leer();
    leido = true;
  }
  return cache;
}

export function guardarMoneda(clave: RateKey): void {
  cache = clave;
  leido = true;

  try {
    localStorage.setItem(CLAVE, clave);
  } catch {
    // Sin almacenamiento no se recuerda entre visitas; la sesión actual sigue
    // funcionando igual.
  }

  for (const oyente of oyentes) oyente();
}

export function suscribirMoneda(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  return () => {
    oyentes.delete(alCambiar);
  };
}

/** En el servidor no hay preferencia: se renderiza el arranque por defecto. */
export const monedaEnServidor = (): RateKey | null => null;
