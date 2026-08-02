import { RateCard } from "@/components/RateCard";
import { FLAGS } from "@/lib/flags";
import { RATE_ORDER } from "@/lib/rates";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Las cinco referencias del día.
 *
 * El peso ocupa dos tarjetas —oficial y frontera— en vez de amontonar ambas
 * cifras en una: son dos precios distintos del mismo billete y conviene
 * compararlos de un vistazo.
 */
export function RatePanel({ snapshot }: { snapshot: RatesSnapshot }) {
  const keys = RATE_ORDER.filter((key) => key !== "VES");

  return (
    <section aria-labelledby="tasas-titulo" className="flex flex-col gap-3">
      <h2
        id="tasas-titulo"
        className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]"
      >
        Tasas de hoy
      </h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {keys.map((key) => {
          const rate = snapshot.rates[key];

          return (
            <RateCard
              key={key}
              label={rate.label}
              flag={FLAGS[key]}
              value={rate.bsPerUnit}
              source={rate.source}
              updatedAt={rate.updatedAt}
              note={rate.note}
            />
          );
        })}
      </div>
    </section>
  );
}
