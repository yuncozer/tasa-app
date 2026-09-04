"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { BotonCompartir } from "@/components/BotonCompartir";
import { BotonCopiar } from "@/components/BotonCopiar";
import { Flag } from "@/components/Flag";
import { Tooltip } from "@/components/Tooltip";
import { FLAGS } from "@/lib/flags";
import { formatAmount, formatRate } from "@/lib/format";
import { destinoPrincipal } from "@/lib/convert";
import { RATE_ORDER, equivalenceHelp } from "@/lib/rates";
import type { ConversionResult, RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Equivalentes del monto en todas las demás bases.
 *
 * La primera fila va destacada porque es el pivote del cálculo: primero se ve en
 * cuántos Bs se convierte el monto y debajo qué se puede comprar con ellos.
 *
 * **Salvo cuando el origen ya son bolívares**, y eso es lo que decide
 * `destinoPrincipal()` (`lib/convert.ts`). Ahí el pivote es un no-op y el
 * renglón de honor decía "80.739,00 Bs = 80.739,00 Bs": ocupaba el sitio más
 * visible de la pantalla para no aportar nada, y encima el botón de copiar de
 * esa fila copiaba lo que el usuario acababa de teclear. Se asciende la primera
 * equivalencia con precio, que además **se retira de la lista** de abajo para no
 * enseñar la misma cifra dos veces.
 *
 * La regla vive en `lib/convert.ts` y no aquí porque la comparten la pantalla,
 * la imagen que se comparte y su pie de texto: los tres viajan juntos en el
 * mismo mensaje y no pueden resumir cosas distintas.
 */
export function ConversionResults({
  conversion,
  snapshot,
}: {
  conversion: ConversionResult;
  snapshot: RatesSnapshot;
}) {
  const [elegido, setElegido] = useState<RateKey | null>(null);

  /**
   * El destacado se **deriva**, no se sincroniza con un efecto: al cambiar de
   * moneda de origen el selector deja de pintarse y esta expresión vuelve sola
   * al valor por defecto, sin un `setState` dentro de un `useEffect` — el
   * patrón que este proyecto evita en todas partes.
   *
   * Se comprueba también que la elegida siga teniendo precio: si su proveedor
   * se cae mientras está seleccionada, se cae al de por defecto en vez de
   * destacar un guion.
   */
  const seleccionable = conversion.from === "VES";
  const destino =
    seleccionable && elegido && conversion.results[elegido] !== null
      ? elegido
      : destinoPrincipal(conversion);

  const valorDestacado = destino === "VES" ? conversion.bs : conversion.results[destino];
  const metaDestino = snapshot.rates[destino];

  const others = RATE_ORDER.filter((key) => key !== conversion.from && key !== destino);

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
          {/* "bolívares" en plural y en minúscula es como se lee mejor en el
              caso normal; para cualquier otra moneda sirve su propia etiqueta,
              la misma que usan las filas de abajo. */}
          <p className="text-xs text-[color:var(--muted)]">
            {destino === "VES" ? "Son, en bolívares" : `Son, en ${metaDestino.label}`}
          </p>
          <p className="tabular text-2xl font-semibold text-[color:var(--accent)]">
            {formatAmount(valorDestacado, destino)}{" "}
            <span className="text-base font-normal">{metaDestino.symbol}</span>
          </p>
        </div>
        {/* Compartir va junto a copiar, no en su lugar: copiar sirve cuando
            la cifra tiene que entrar en otra cuenta, y compartir cuando el
            destino es un chat. La imagen se pide solo al pulsar. */}
        {valorDestacado !== null && (
          <div className="flex shrink-0 items-center gap-1">
            <BotonCompartir conversion={conversion} destino={destino} fetchedAt={snapshot.fetchedAt} />
            <BotonCopiar
              texto={formatAmount(valorDestacado, destino)}
              etiqueta={destino === "VES" ? "monto en bolívares" : `monto en ${metaDestino.label}`}
            />
          </div>
        )}
      </div>

      {/* Solo con bolívares de origen. Con cualquier otro, el destacado es el
          bolívar y no hay nada que elegir: es el pivote de toda la app, y
          hacerlo opcional ahí diluiría el modelo mental que sostiene el resto
          de la pantalla. Aquí, en cambio, el valor por defecto es arbitrario
          —el dólar BCV solo por ser el primero del orden— y quien tiene
          bolívares puede querer verlos en Binance venta o en euros. */}
      {seleccionable && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            Ver en
          </p>
          <div role="group" aria-label="Moneda del resultado destacado" className="grid grid-cols-3 gap-2">
            {RATE_ORDER.filter((key) => key !== "VES").map((key) => {
              const rate = snapshot.rates[key];
              const activa = key === destino;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setElegido(key)}
                  aria-pressed={activa}
                  disabled={conversion.results[key] === null}
                  className={`rounded-xl border px-2 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
                    activa
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                      : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)]"
                  }`}
                >
                  {rate.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
