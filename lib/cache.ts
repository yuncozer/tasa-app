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
      store.set(key, { value, expiresAt: Date.now() + ttlMs, inFlight: null });
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
    inFlight,
  });

  return inFlight;
}

/** Vacía la caché. Solo se usa desde `/api/rates?refresh=1`. */
export function clearCache(): void {
  store.clear();
}
