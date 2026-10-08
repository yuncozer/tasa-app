"use client";

import { Check, Copy } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { BotonCompartir } from "@/components/BotonCompartir";
import { BotonCopiar } from "@/components/BotonCopiar";
import { Flag } from "@/components/Flag";
import { RecomendacionPago } from "@/components/RecomendacionPago";
import { FLAGS } from "@/lib/flags";
import { registrarEvento } from "@/lib/analitica-cliente";
import { formatAmount } from "@/lib/format";
import { destinoPrincipal } from "@/lib/convert";
import { guardarZona, suscribirZona, zonaDeducida, zonaEnServidor, zonaGuardada } from "@/lib/preferencia-zona";
import { RATE_ORDER } from "@/lib/rates";
import { recomendar } from "@/lib/recomendacion";
import type { ConversionResult, Rate, RateKey, RatesSnapshot } from "@/lib/types";


/**
 * Una equivalencia. **Toda la fila es el botón de copiar**: eran siete
 * íconos pequeños apilados en la columna derecha, cada uno un blanco de
 * apenas 28 px, y la fila entera ya era el blanco más natural. El ícono se
 * queda como pista de que se puede tocar, y cambia a un visto al copiar.
 *
 * Ya no lleva la tasa ("a 1.022,87 Bs") ni el ⓘ: las dos cosas están en el
 * tablero de arriba, y repetirlas en cada fila era la mitad del ruido de esta
 * lista. Copia **el número tal como se ve**, igual que `BotonCopiar`.
 */
function FilaEquivalencia({
  rate,
  claveRate,
  valor,
  mejor,
}: {
  rate: Rate;
  claveRate: RateKey;
  valor: number | null;
  mejor: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = formatAmount(valor, claveRate);
  const sinValor = valor === null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      registrarEvento("copiar", `monto en ${rate.label}`);
      // Vuelve solo: un "copiado" permanente dejaría de significar que lo
      // guardado es esta cifra y no otra.
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer.
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={copiar}
        disabled={sinValor}
        aria-label={copiado ? `${rate.label} copiado` : `Copiar monto en ${rate.label}`}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition active:bg-[color:var(--surface-strong)]/60 disabled:opacity-50"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
          <Flag pais={FLAGS[claveRate]} className="shrink-0" />
          {/* El P2P no es una tasa de ningún país: el logo de Binance va
              aparte de la bandera, igual que en el tablero. */}
          {(claveRate === "USD_BINANCE_BUY" || claveRate === "USD_BINANCE_SELL") && (
            // eslint-disable-next-line @next/next/no-img-element -- SVG estático y decorativo.
            <img src="/SVG/binance.svg" alt="" width={14} height={14} className="shrink-0" />
          )}
          <span className="truncate">{rate.label}</span>
          </div>
          {/* Señala la fila que respalda "Qué rinde más", para que se vea de
              dónde sale sin repetir la cifra. Va debajo del nombre y no a su
              lado: a 390 px ahí le quitaba el sitio y truncaba la etiqueta. */}
          {mejor && (
            <span className="mt-1 inline-block rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Rinde más
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span className="tabular text-lg font-semibold">
            <span className="mr-1 text-xs font-normal text-[color:var(--muted)]">{rate.symbol}</span>
            {texto}
          </span>
          {/* Sin valor no hay nada que copiar: el ícono desaparece en vez de
              ofrecer copiar un guion. */}
          {!sinValor &&
            (copiado ? (
              <Check aria-hidden="true" className="size-4 text-[color:var(--accent)]" />
            ) : (
              <Copy aria-hidden="true" className="size-4 opacity-60" />
            ))}
        </span>
      </button>
    </li>
  );
}

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

  // Manda lo que el usuario eligió; si no eligió, se deduce de la moneda de
  // origen. Solo se adapta el consejo: la lista enseña siempre todas las tasas.
  const guardada = useSyncExternalStore(suscribirZona, zonaGuardada, zonaEnServidor);
  const zona = guardada ?? zonaDeducida(conversion.from);
  const recomendacion = recomendar(conversion, zona);

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
        {others.map((key) => (
          <FilaEquivalencia
            key={key}
            rate={snapshot.rates[key]}
            valor={conversion.results[key]}
            claveRate={key}
            mejor={recomendacion?.mejor === key}
          />
        ))}
      </ul>

      <RecomendacionPago recomendacion={recomendacion} zona={zona} onZona={guardarZona} />
    </section>
  );
}
