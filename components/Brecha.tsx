import { brechaDelSnapshot } from "@/lib/brecha";
import { formatPercent } from "@/lib/format";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Cuánto se paga de más fuera de la tasa oficial, siempre a la vista.
 *
 * Va debajo del tablero y no dentro de la calculadora por tres motivos: es
 * un dato derivado de dos filas que están justo encima —leerlo pegado a ellas
 * explica de dónde sale—, la calculadora es un formulario y una cifra que no
 * cambia al teclear competiría con el número que el usuario sí está
 * manipulando, y aquí entra en el primer pantallazo del teléfono.
 *
 * Es una **línea** y no una tarjeta del mismo peso que las tasas: la brecha no
 * es un precio, es la distancia entre dos de ellos. Con la tarjeta entera
 * competía en tamaño con las cifras de las que sale. La frase que antes iba en
 * un tooltip ("Dólar Binance (venta) frente al BCV") ahora es parte del nombre:
 * lo que mide tiene que leerse sin tocar nada.
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
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2 ${
        sinDato ? "border-warning/40 bg-warning/5" : "border-border-soft"
      }`}
    >
      <p className="min-w-0 truncate text-sm text-muted">Brecha: Binance (venta) frente al BCV</p>

      {sinDato ? (
        <p className="shrink-0 text-xs text-warning">Sin dato</p>
      ) : (
        <p className="tabular shrink-0 text-lg font-semibold leading-none">{formatPercent(valor)}</p>
      )}
    </div>
  );
}
