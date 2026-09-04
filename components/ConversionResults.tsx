import { Info } from "lucide-react";
import { BotonCompartir } from "@/components/BotonCompartir";
import { BotonCopiar } from "@/components/BotonCopiar";
import { Flag } from "@/components/Flag";
import { Tooltip } from "@/components/Tooltip";
import { FLAGS } from "@/lib/flags";
import { formatAmount, formatRate } from "@/lib/format";
import { RATE_ORDER, equivalenceHelp } from "@/lib/rates";
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

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-[color:var(--muted)]">Son, en bolívares</p>
          <p className="tabular text-2xl font-semibold text-[color:var(--accent)]">
            {formatAmount(conversion.bs, "VES")}{" "}
            <span className="text-base font-normal">Bs</span>
          </p>
        </div>
        {/* Compartir va junto a copiar, no en su lugar: copiar sirve cuando
            la cifra tiene que entrar en otra cuenta, y compartir cuando el
            destino es un chat. La imagen se pide solo al pulsar. */}
        {conversion.bs !== null && (
          <div className="flex shrink-0 items-center gap-1">
            <BotonCompartir monto={conversion.amount} origen={conversion.from} />
            <BotonCopiar texto={formatAmount(conversion.bs, "VES")} etiqueta="monto en bolívares" />
          </div>
        )}
      </div>

      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
        {others.map((key) => {
          const rate = snapshot.rates[key];
          const value = conversion.results[key];
          const help = equivalenceHelp(key);
          return (
            <li key={key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                {/* La ayuda cuelga del nombre, no del monto: el nombre es lo
                    que el usuario no entiende, y así el número queda intacto. */}
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Flag pais={FLAGS[key]} className="shrink-0" />
                  {/* El P2P no es una tasa de ningún país: el logo de Binance
                      va aparte de la bandera, igual que en RateCard. */}
                  {(key === "USD_BINANCE_BUY" || key === "USD_BINANCE_SELL") && (
                    // eslint-disable-next-line @next/next/no-img-element -- SVG estático y decorativo.
                    <img src="/SVG/binance.svg" alt="" width={14} height={14} className="shrink-0" />
                  )}
                  <span className="truncate">{rate.label}</span>
                  {help.cardDescription && (
                    <Tooltip className="shrink-0" content={help.cardDescription}>
                      <Info aria-hidden="true" className="size-3.5 opacity-60" />
                    </Tooltip>
                  )}
                </div>
                <p className="tabular text-xs text-[color:var(--muted)]">
                  {rate.bsPerUnit === null
                    ? "Tasa no disponible"
                    : `a ${formatRate(rate.bsPerUnit)} Bs`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <p className="tabular text-lg font-semibold">
                  <span className="mr-1 text-xs font-normal text-[color:var(--muted)]">
                    {rate.symbol}
                  </span>
                  {formatAmount(value, key)}
                </p>
                {/* Sin valor no hay nada que copiar: el botón desaparece en vez
                    de dejar copiar un guion. */}
                {value !== null && (
                  <BotonCopiar texto={formatAmount(value, key)} etiqueta={`monto en ${rate.label}`} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
