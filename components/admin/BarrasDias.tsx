import { formatEntero, formatFecha } from "@/lib/format";

/**
 * Una serie diaria en barras, dibujadas con SVG a mano.
 *
 * Mismo criterio que `components/Sparkline.tsx` y por el mismo motivo: el
 * proyecto no tiene librería de gráficos y añadir una costaría más de cien
 * kilobytes. Es componente de servidor, así que no lleva ni una línea de
 * JavaScript al navegador.
 *
 * Barras y no línea porque lo que se compara son conteos de días sueltos —"el
 * domingo hubo el doble que el lunes"— y no una tendencia continua como la de
 * una tasa. Sin ejes ni rejilla: el máximo va escrito arriba y el detalle
 * exacto de cada día viaja en el `<title>` de su barra, que es lo que lee un
 * lector de pantalla y lo que sale al mantener el dedo encima.
 */

const ALTO = 100;
/** Un día vale 10 unidades de ancho y 2 se van en la separación. */
const ANCHO_DIA = 10;
const HUECO = 2;

export function BarrasDias({
  serie,
  etiqueta,
}: {
  /** En orden cronológico: el más antiguo primero. */
  serie: { fecha: string; valor: number }[];
  etiqueta: string;
}) {
  if (serie.length === 0) {
    return <p className="text-sm text-muted">Sin datos en este período.</p>;
  }

  const maximo = Math.max(...serie.map((dia) => dia.valor));
  const ancho = serie.length * ANCHO_DIA;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span>{etiqueta}</span>
        <span className="tabular">máx. {formatEntero(maximo)}</span>
      </div>

      <svg
        viewBox={`0 0 ${ancho} ${ALTO}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${etiqueta}: ${serie.length} días`}
        className="h-24 w-full"
      >
        {serie.map((dia, indice) => {
          // Con todo en cero no hay proporción posible, y dividir daría NaN:
          // en ese caso no se dibuja barra, que es lo que de verdad describe.
          const alto = maximo === 0 ? 0 : (dia.valor / maximo) * ALTO;
          const x = indice * ANCHO_DIA;
          return (
            <rect
              key={dia.fecha}
              x={x}
              y={ALTO - alto}
              width={ANCHO_DIA - HUECO}
              height={alto}
              rx={1}
              fill="var(--accent)"
              opacity={0.75}
            >
              <title>{`${formatFecha(dia.fecha)}: ${formatEntero(dia.valor)}`}</title>
            </rect>
          );
        })}
      </svg>

      <div className="flex justify-between text-xs text-muted">
        <span>{formatFecha(serie[0].fecha)}</span>
        <span>{formatFecha(serie[serie.length - 1].fecha)}</span>
      </div>
    </div>
  );
}
