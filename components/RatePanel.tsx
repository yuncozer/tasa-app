import { RateCard } from "@/components/RateCard";
import { FLAGS } from "@/lib/flags";
import { RATE_ORDER, rateHelp } from "@/lib/rates";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Las cinco referencias del día.
 *
 * El peso ocupa dos tarjetas —oficial y frontera— en vez de amontonar ambas
 * cifras en una: son dos precios distintos del mismo billete y conviene
 * compararlos de un vistazo.
 *
 * Binance es al revés: compra y venta comparten bandera, fuente y nota (salen
 * del mismo fetch), así que van en una sola tarjeta con los dos montos
 * apilados en vez de duplicar toda esa información en dos tarjetas.
 */
export function RatePanel({ snapshot }: { snapshot: RatesSnapshot }) {
  const keys = RATE_ORDER.filter((key) => key !== "VES" && key !== "USD_BINANCE_SELL");

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
          if (key === "USD_BINANCE_BUY") {
            const buy = snapshot.rates.USD_BINANCE_BUY;
            const sell = snapshot.rates.USD_BINANCE_SELL;
            const buyHelp = rateHelp("USD_BINANCE_BUY");
            const sellHelp = rateHelp("USD_BINANCE_SELL");

            return (
              <RateCard
                key="binance"
                label="Dólar Binance"
                flag={FLAGS.USD_BINANCE_BUY}
                platformLogo="/SVG/binance.svg"
                amounts={[
                  { label: "Compra", value: buy.bsPerUnit },
                  { label: "Venta", value: sell.bsPerUnit },
                ]}
                source={buy.source}
                updatedAt={buy.updatedAt}
                note={buy.note}
                description={buyHelp.cardDescription}
                amountHelp={[
                  buyHelp.amountHelp?.[0] || "",
                  sellHelp.amountHelp?.[0] || "",
                ]}
              />
            );
          }

          const rate = snapshot.rates[key];
          const help = rateHelp(key);

          return (
            <RateCard
              key={key}
              label={rate.label}
              flag={FLAGS[key]}
              amounts={[{ value: rate.bsPerUnit }]}
              source={rate.source}
              updatedAt={rate.updatedAt}
              note={rate.note}
              description={help.cardDescription}
              amountHelp={typeof help.amountHelp === "string" ? help.amountHelp : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
