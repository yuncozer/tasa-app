import { Info } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { brechaDelSnapshot } from "@/lib/brecha";
import { formatPercent } from "@/lib/format";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Cuánto se paga de más fuera de la tasa oficial, siempre a la vista.
 *
 * Va debajo de las tarjetas y no dentro de la calculadora por tres motivos: es
 * un dato derivado de dos tarjetas que están justo encima —leerlo pegado a ellas
 * explica de dónde sale—, la calculadora es un formulario y una cifra que no
 * cambia al teclear competiría con el número que el usuario sí está
 * manipulando, y aquí entra en el primer pantallazo del teléfono.
 *
 * **No cambia de color según su valor.** Pintarla de ámbar pasado cierto umbral
 * exigiría inventar ese umbral, y en este proyecto `--warning` significa "este
 * número no es de fiar ahora mismo", no "este número es alto": una brecha
 * grande es un dato correcto. El ámbar queda para lo que le toca, que es cuando
 * falta una de las dos tasas y no hay brecha que mostrar.
 *
 * Tampoco lleva la variación de la semana, que sí tiene la tarjeta del reporte
 * semanal: esa sale del histórico de Supabase y aquí sería una consulta por
 * visitante. La portada dice dónde está la brecha; el reporte semanal, hacia
 * dónde va.
 */
export function Brecha({ snapshot }: { snapshot: RatesSnapshot }) {
  const valor = brechaDelSnapshot(snapshot);
  const sinDato = valor === null;

  return (
    <article
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        sinDato ? "border-warning/40 bg-warning/5" : "border-border-soft bg-surface"
      }`}
    >
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <span className="truncate">Brecha BCV / Binance</span>
          <Tooltip
            className="shrink-0"
            content="Cuánto más caro está el dólar en Binance (venta) frente a la tasa oficial del BCV"
          >
            <Info aria-hidden="true" className="size-3.5 opacity-60" />
          </Tooltip>
        </h3>
        <p className="mt-1 truncate text-xs text-muted">Dólar Binance (venta) frente al BCV</p>
      </div>

      {sinDato ? (
        <p className="shrink-0 text-xs text-warning">Sin dato</p>
      ) : (
        <p className="tabular shrink-0 text-2xl font-semibold leading-none sm:text-3xl">{formatPercent(valor)}</p>
      )}
    </article>
  );
}
