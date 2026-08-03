import { Tooltip } from "@/components/Tooltip";
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
  /** Descripción breve de la tasa (para tooltip). */
  description?: string;
  /** Texto de ayuda para cada monto (string único o array para múltiples montos). */
  amountHelp?: string | string[];
}

/**
 * Una tasa del día: fila con dos contenedores.
 *
 * El primero (`flex-1`, con `min-w-0` para poder truncar) lleva toda la
 * información que no cambia de ancho: nombre, detalle y fuente. El segundo
 * (`shrink-0`) nunca se comprime —los montos no deben partirse— y lleva una
 * fila por cada monto; Binance trae dos (compra y venta) porque a partir de
 * cierto monto la diferencia entre ambas es real y no un detalle menor.
 */
export function RateCard({
  label,
  flag,
  amounts,
  source,
  updatedAt,
  note,
  description,
  amountHelp,
}: RateCardProps) {
  const unavailable = amounts.every((amount) => amount.value === null);
  const stacked = amounts.length > 1;
  const amountHelpArray = Array.isArray(amountHelp) ? amountHelp : amountHelp ? [amountHelp] : [];

  return (
    <article
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 sm:py-4 ${
        unavailable
          ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/5"
          : "border-[color:var(--border)] bg-[color:var(--surface)]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 truncate text-sm font-medium text-[color:var(--muted)]">
          {/* La bandera acompaña al nombre; el lector de pantalla ya lee la moneda. */}
          <span aria-hidden="true">{flag}</span>
          {label}
          {description && (
            <Tooltip content={description}>
              <span className="text-xs opacity-60">(?)</span>
            </Tooltip>
          )}
        </h3>

        <div className="mt-1 text-xs text-[color:var(--muted)]">
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
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {amounts.map((amount, index) => {
          const help = amountHelpArray[index];
          return (
            <div key={amount.label ?? index} className="text-right">
              {/* El prefijo va arriba del monto, no delante: así no le quita
                  ancho horizontal a la columna de info. */}
              {amount.label && (
                <p className="text-xs leading-none text-[color:var(--muted)]">{amount.label}</p>
              )}
              {help ? (
                <Tooltip content={help}>
                  <p
                    className={`tabular leading-none ${
                      stacked ? "text-lg font-semibold sm:text-xl" : "text-2xl font-semibold sm:text-3xl"
                    }`}
                  >
                    {formatRate(amount.value)}
                    <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">Bs</span>
                  </p>
                </Tooltip>
              ) : (
                <p
                  className={`tabular leading-none ${
                    stacked ? "text-lg font-semibold sm:text-xl" : "text-2xl font-semibold sm:text-3xl"
                  }`}
                >
                  {formatRate(amount.value)}
                  <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">Bs</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
