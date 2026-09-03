/**
 * Caché en memoria con TTL, deduplicación de peticiones en vuelo y respaldo
 * ante fallos.
 *
 * Las tasas cambian pocas veces al día, así que no tiene sentido golpear al BCV
 * o a Binance en cada visita. Además, si un proveedor se cae, es preferible
 * mostrar el último valor bueno (marcándolo con su fecha) antes que dejar la
 * tarjeta vacía: por eso `withCache` reutiliza el valor expirado cuando la
 * función falla.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  /** Cuándo se guardó este valor. Lo necesita `olvidarSiViejo`. */
  guardadoEn: number;
  inFlight: Promise<T> | null;
}

const store = new Map<string, Entry<unknown>>();

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;

  if (entry && entry.expiresAt > now) return entry.value;
  if (entry?.inFlight) return entry.inFlight;

  const inFlight = fetcher()
    .then((value) => {
      const ahora = Date.now();
      store.set(key, { value, expiresAt: ahora + ttlMs, guardadoEn: ahora, inFlight: null });
      return value;
    })
    .catch((error) => {
      // Se conserva el último valor bueno un rato más para no quedar sin dato.
      if (entry) {
        store.set(key, { ...entry, expiresAt: Date.now() + ttlMs, inFlight: null });
        return entry.value;
      }
      store.delete(key);
      throw error;
    });

  store.set(key, {
    value: entry?.value as T,
    expiresAt: entry?.expiresAt ?? 0,
    guardadoEn: entry?.guardadoEn ?? 0,
    inFlight,
  });

  return inFlight;
}

/**
 * Olvida una sola entrada.
 *
 * La usa `lib/instagram-token.ts` tras renovar el token: la copia en memoria
 * guarda el anterior y, sin esto, esta instancia seguiría publicando con él
 * hasta que venza el TTL. Sigue siendo válido, pero el sentido de renovar es
 * dejar de usarlo.
 */
export function olvidar(key: string): void {
  store.delete(key);
}

/**
 * Olvida una entrada, pero solo si su valor ya tiene cierta edad.
 *
 * Es lo que usa el botón "Actualizar tasas" (ver `pedirTasasFrescas()` en
 * `lib/rates.ts`). Existe para que un refresco pedido desde fuera no se
 * traduzca en una ronda a los proveedores por cada petición: lo que se
 * refresca a mano tiene un ritmo humano, y por debajo de unos segundos no hay
 * nada nuevo que traer.
 *
 * Devuelve si llegó a borrar algo, por si alguien quiere distinguir "se pidió
 * y se hizo" de "se pidió y era demasiado pronto".
 */
export function olvidarSiViejo(key: string, edadMinimaMs: number): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() - entry.guardadoEn < edadMinimaMs) return false;

  store.delete(key);
  return true;
}
