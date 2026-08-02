import { RateCard } from "@/components/RateCard";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Las cuatro referencias del día. El peso va en una sola tarjeta con sus dos
 * cruces, porque en la práctica es una misma moneda vista con dos dólares
 * distintos.
 */
export function RatePanel({ snapshot }: { snapshot: RatesSnapshot }) {
  const { USD_BCV, USD_BINANCE, EUR_BCV, COP_BCV, COP_BINANCE } = snapshot.rates;

  return (
    <section aria-labelledby="tasas-titulo" className="flex flex-col gap-3">
      <h2 id="tasas-titulo" className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">
        Tasas de hoy
      </h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <RateCard
          label="Dólar BCV"
          symbol="$"
          value={USD_BCV.bsPerUnit}
          source={USD_BCV.source}
          updatedAt={USD_BCV.updatedAt}
        />
        <RateCard
          label="Dólar Binance P2P"
          symbol="$"
          value={USD_BINANCE.bsPerUnit}
          source={USD_BINANCE.source}
          updatedAt={USD_BINANCE.updatedAt}
          note={USD_BINANCE.note}
        />
        <RateCard
          label="Euro BCV"
          symbol="€"
          value={EUR_BCV.bsPerUnit}
          source={EUR_BCV.source}
          updatedAt={EUR_BCV.updatedAt}
        />
        <RateCard
          label="Peso colombiano"
          symbol="COL$"
          value={COP_BCV.bsPerUnit}
          secondary={{ label: "Cruce Binance", value: COP_BINANCE.bsPerUnit }}
          source={COP_BCV.source}
          updatedAt={COP_BCV.updatedAt}
          note={COP_BCV.note ? `Cruce BCV arriba · ${COP_BCV.note}` : "Cruce BCV arriba"}
        />
      </div>
    </section>
  );
}
