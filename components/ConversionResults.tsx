import { Tooltip } from "@/components/Tooltip";
import { FLAGS } from "@/lib/flags";
import { formatAmount, formatRate } from "@/lib/format";
import { RATE_ORDER } from "@/lib/rates";
import type { ConversionResult, RatesSnapshot } from "@/lib/types";

/**
 * Equivalentes del monto en todas las demás bases.
 *
 * La fila de bolívares va destacada porque es el pivote del cálculo: primero se
 * ve en cuántos Bs se convierte el monto y debajo qué se puede comprar con ellos.
 */
export function ConversionResults({
  conversion,
  snapshot,
}: {
  conversion: ConversionResult;
  snapshot: RatesSnapshot;
}) {
  const others = RATE_ORDER.filter((key) => key !== conversion.from && key !== "VES");

  return (
    <section aria-labelledby="resultados-titulo" className="flex flex-col gap-2">
      <h2
        id="resultados-titulo"
        className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]"
      >
        Equivalencias
      </h2>

      <div className="rounded-2xl border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-4 py-3">
        <p className="text-xs text-[color:var(--muted)]">Son, en bolívares</p>
        <p className="tabular text-2xl font-semibold text-[color:var(--accent)]">
          {formatAmount(conversion.bs, "VES")}{" "}
          <span className="text-base font-normal">Bs</span>
        </p>
      </div>

      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
        {others.map((key) => {
          const rate = snapshot.rates[key];
          const value = conversion.results[key];

          return (
            <li key={key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  <span aria-hidden="true" className="mr-1.5">
                    {FLAGS[key]}
                  </span>
                  {rate.label}
                </p>
                <p className="tabular text-xs text-[color:var(--muted)]">
                  {rate.bsPerUnit === null
                    ? "Tasa no disponible"
                    : `a ${formatRate(rate.bsPerUnit)} Bs`}
                </p>
              </div>
              <Tooltip
                className="shrink-0"
                content={`Equivalente en ${rate.label} a la tasa actual`}
              >
                <p className="tabular text-lg font-semibold">
                  <span className="mr-1 text-xs font-normal text-[color:var(--muted)]">
                    {rate.symbol}
                  </span>
                  {formatAmount(value, key)}
                </p>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
