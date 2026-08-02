import { formatDate, formatRate, formatRelative } from "@/lib/format";

interface RateAmount {
  /** Prefijo antes del valor, p. ej. "Compra". Solo se ve cuando hay más de un monto. */
  label?: string;
  value: number | null;
}

interface RateCardProps {
  label: string;
  /** Bandera del país de la moneda (decorativa). */
  flag: string;
  /**
   * Bolívares por unidad. Casi siempre un solo monto; Binance trae dos
   * (compra y venta) porque a partir de cierto monto la diferencia entre
   * ambas es real y no un detalle menor.
   */
  amounts: RateAmount[];
  source: string;
  updatedAt: string | null;
  /** Detalle propio de la tasa, p. ej. la operación de referencia del P2P. */
  note?: string;
}

/**
 * Una tasa del día, con dos formas según el ancho:
 *
 * - En el teléfono es una fila: nombre a la izquierda, valor a la derecha y el
 *   detalle en una línea completa debajo. Así ningún nombre se parte en dos.
 * - A partir de `sm` vuelve a ser una tarjeta apilada dentro de la rejilla.
 *
 * Se limita a dos líneas de apoyo —detalle y fuente— para que el panel se lea de
 * un vistazo, que es como se usa: de pie, en mitad de una compra.
 */
export function RateCard({ label, flag, amounts, source, updatedAt, note }: RateCardProps) {
  const unavailable = amounts.every((amount) => amount.value === null);
  const stacked = amounts.length > 1;

  return (
    <article
      className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 sm:grid-cols-1 sm:items-stretch sm:gap-y-2 sm:py-4 ${
        unavailable
          ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/5"
          : "border-[color:var(--border)] bg-[color:var(--surface)]"
      }`}
    >
      <h3 className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-[color:var(--muted)]">
        {/* La bandera acompaña al nombre; el lector de pantalla ya lee la moneda. */}
        <span aria-hidden="true">{flag}</span>
        {label}
      </h3>

      <div
        className={`min-w-0 justify-self-end sm:justify-self-start ${stacked ? "flex flex-col gap-0.5" : ""}`}
      >
        {amounts.map((amount, index) => (
          <p
            key={amount.label ?? index}
            className={`tabular leading-none ${
              stacked
                ? "text-lg font-semibold sm:text-xl"
                : "text-2xl font-semibold sm:text-3xl"
            }`}
          >
            {amount.label && (
              /* En el teléfono va arriba del número, no delante: en una sola
                 línea ("Compra 847,80 Bs") la tarjeta se sale del ancho de
                 pantalla y arrastra a las demás con ella (mismo grid). */
              <span className="mr-1 block text-xs font-normal text-[color:var(--muted)] sm:inline">
                {amount.label}
              </span>
            )}
            {formatRate(amount.value)}
            <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">Bs</span>
          </p>
        ))}
      </div>

      <div className="col-span-2 text-xs text-[color:var(--muted)] sm:col-span-1 sm:mt-auto">
        {unavailable ? (
          <p className="text-[color:var(--warning)]">Dato no disponible ahora mismo</p>
        ) : (
          <>
            {note && <p>{note}</p>}
            {/* La fecha exacta queda en el título, al alcance del ratón. */}
            <p className="truncate" title={formatDate(updatedAt)}>
              {source} · {formatRelative(updatedAt)}
            </p>
          </>
        )}
      </div>
    </article>
  );
}
