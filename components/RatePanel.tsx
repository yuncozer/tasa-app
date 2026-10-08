import { Brecha } from "@/components/Brecha";
import { RateCard } from "@/components/RateCard";
import { VistasTasas } from "@/components/VistasTasas";
import { FLAGS } from "@/lib/flags";
import { buildFilasPesos, type FilaPesosId } from "@/lib/pesos";
import { RATE_ORDER, rateHelp, inverseHelp } from "@/lib/rates";
import type { RateKey, RatesSnapshot } from "@/lib/types";

const LISTA =
  "divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface";

/** País de cada fila de la lámina en pesos: el dólar es de EE. UU. y el bolívar, de Venezuela. */
const PAIS_PESOS: Record<FilaPesosId, "US" | "VE"> = {
  TRM: "US",
  FRONTERA_BUY: "US",
  FRONTERA_SELL: "US",
  VES_PROMEDIO: "VE",
};

/**
 * Qué tasa respalda la fuente y la antigüedad de cada fila en pesos: la TRM
 * es del Banco de la República y las otras tres cruzan por el peso Binance.
 */
const RESPALDO_PESOS: Record<FilaPesosId, RateKey> = {
  TRM: "COP_OFICIAL",
  FRONTERA_BUY: "COP_FRONTERA",
  FRONTERA_SELL: "COP_FRONTERA",
  VES_PROMEDIO: "COP_FRONTERA",
};

/**
 * Las tasas del día, en las dos láminas del post diario: bolívares y pesos.
 *
 * **Bolívares** lleva las mismas filas, en el mismo orden y con los mismos
 * nombres que la primera lámina —Binance compra y venta cada una en su fila,
 * como ahí—, más el peso oficial, que el post no muestra pero la web sí: es el
 * otro precio del mismo billete y conviene verlo junto al de Binance.
 *
 * **Pesos** sale de `buildFilasPesos()`, la misma lista que arma la segunda
 * lámina y su caption. No se rehace aquí: es el mismo informe y no pueden
 * decir cosas distintas.
 *
 * Debajo va la brecha, que no es una tasa más sino la distancia entre dos de
 * las de arriba. Ni ella ni La Parada están en el post diario porque tienen su
 * propio post; aquí acompañan al tablero y no dependen de la vista elegida.
 */
export function RatePanel({ snapshot }: { snapshot: RatesSnapshot }) {
  const claves = RATE_ORDER.filter((key) => key !== "VES");

  const bolivares = (
    <ul className={LISTA}>
      {claves.map((key) => {
        const rate = snapshot.rates[key];
        const help = rateHelp(key);
        const inverse =
          key === "COP_OFICIAL" || key === "COP_FRONTERA"
            ? {
                value: rate.bsPerUnit ? 1 / rate.bsPerUnit : null,
                prefix: `1Bs = `,
                help: inverseHelp(key),
                symbol: rate.symbol,
              }
            : undefined;
        const ayudaMonto = Array.isArray(help.amountHelp) ? help.amountHelp[0] : help.amountHelp;

        return (
          <RateCard
            key={key}
            label={rate.label}
            flag={FLAGS[key]}
            platformLogo={
              key === "USD_BINANCE_BUY" || key === "USD_BINANCE_SELL" ? "/SVG/binance.svg" : undefined
            }
            valor={rate.bsPerUnit}
            help={ayudaMonto || undefined}
            source={rate.source}
            updatedAt={rate.updatedAt}
            note={rate.note}
            description={help.cardDescription}
            inverse={inverse}
          />
        );
      })}
    </ul>
  );

  const pesos = (
    <ul className={LISTA}>
      {buildFilasPesos(snapshot).map((fila) => {
        const respaldo = snapshot.rates[RESPALDO_PESOS[fila.id]];
        return (
          <RateCard
            key={fila.id}
            label={fila.label}
            flag={PAIS_PESOS[fila.id]}
            platformLogo={fila.fuente ? "/SVG/binance.svg" : undefined}
            valor={fila.copPerUnit}
            unidad="COP"
            source={respaldo.source}
            updatedAt={respaldo.updatedAt}
          />
        );
      })}
    </ul>
  );

  return (
    <div id="tasas" className="flex scroll-mt-4 flex-col gap-3">
      <VistasTasas bolivares={bolivares} pesos={pesos} />
      <Brecha snapshot={snapshot} />
    </div>
  );
}
