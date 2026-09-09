import { formatFecha, formatRate } from "@/lib/format";

/**
 * La forma de una serie de tasas, en una línea, con sus referencias.
 *
 * El historial es una columna de cifras sueltas: para saber si algo viene
 * subiendo hay que compararlas mentalmente de dos en dos. Esta línea responde
 * esa pregunta de un vistazo, que es como se lee la app —de pie, en un
 * negocio— sin quitarle sitio a los números, que siguen mandando.
 *
 * Se dibuja con SVG a mano y **sin librería de gráficos**: el proyecto no
 * tiene ninguna y añadirla costaría más de cien kilobytes en una app pensada
 * para señal intermitente y teléfonos modestos. Es también la razón de que sea
 * un componente de servidor: no lleva ni una línea de JavaScript al navegador
 * y se ve aunque la página no llegue a hidratar.
 *
 * ## Por qué lleva referencias, y por qué solo cuatro
 *
 * Durante un tiempo fue una raya pelada, con el argumento de que era un
 * indicio de forma y no un gráfico de análisis. El argumento se cae en cuanto
 * alguien la mira: una línea sin una sola cifra alrededor no dice **de qué
 * es**, ni entre qué valores se mueve, ni hacia qué lado avanza el tiempo. Ni
 * siquiera se puede saber si la subida que se ve es de un bolívar o de
 * cincuenta.
 *
 * Así que lleva las cuatro que hacen falta y ni una más: **qué serie es** y su
 * unidad arriba, el **máximo y el mínimo** del tramo a la izquierda, y las
 * **fechas de los extremos** debajo. Eso basta para leer la línea; poner
 * rejilla, marcas intermedias o un valor por punto sería duplicar la lista que
 * va justo debajo, que es donde están las cifras exactas.
 *
 * Las dos cifras de la izquierda marcan el **borde superior e inferior del
 * trazo**, no dos puntos concretos: la línea se dibuja normalizada entre el
 * mínimo y el máximo del tramo, así que su punto más alto es ese máximo y el
 * más bajo ese mínimo. Con una serie plana los dos serían el mismo número, y
 * ahí se enseña uno solo centrado en vez de repetirlo dos veces.
 */

const ANCHO = 300;
const ALTO = 48;
/** Aire arriba y abajo para que el trazo no se corte contra el borde. */
const MARGEN = 4;

export function Sparkline({
  valores,
  etiqueta,
  desde,
  hasta,
}: {
  /** La serie en orden **cronológico**: el más antiguo primero. */
  valores: number[];
  /** Qué serie es, para quien no puede ver la línea y para el encabezado. */
  etiqueta: string;
  /** Día de la primera lectura, "YYYY-MM-DD" de Caracas. Ancla el eje a la izquierda. */
  desde: string;
  /** Día de la última. A la derecha, porque el tiempo avanza hacia allá. */
  hasta: string;
}) {
  // Con un solo punto no hay tendencia que mostrar, y una línea de un punto no
  // se ve: mejor nada que un adorno vacío.
  if (valores.length < 2) return null;

  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const rango = maximo - minimo;

  const paso = ANCHO / (valores.length - 1);
  const puntos = valores.map((valor, indice) => {
    const x = indice * paso;
    // Una serie plana no tiene rango, y dividir entre cero daría NaN: en ese
    // caso la línea va por el medio, que es lo que de verdad describe.
    const proporcion = rango === 0 ? 0.5 : (valor - minimo) / rango;
    const y = MARGEN + (1 - proporcion) * (ALTO - MARGEN * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const primero = valores[0];
  const ultimo = valores[valores.length - 1];
  const resumen =
    ultimo > primero ? "al alza" : ultimo < primero ? "a la baja" : "sin cambio";

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-[color:var(--muted)]">
        <span className="min-w-0 truncate">{etiqueta}</span>
        <span className="shrink-0">en Bs</span>
      </figcaption>

      <div className="flex items-stretch gap-2">
        {/* El eje vertical: los dos bordes del trazo. Va pegado al gráfico y no
            dentro del SVG porque el lienzo se estira sin conservar proporción
            (`preserveAspectRatio="none"`), y un texto ahí dentro saldría
            deformado con él. */}
        <div className="flex shrink-0 flex-col justify-between text-xs text-[color:var(--muted)]">
          {rango === 0 ? (
            <span className="tabular my-auto">{formatRate(maximo)}</span>
          ) : (
            <>
              <span className="tabular leading-none">{formatRate(maximo)}</span>
              <span className="tabular leading-none">{formatRate(minimo)}</span>
            </>
          )}
        </div>

        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          // Se estira al ancho disponible y no conserva la proporción a propósito:
          // lo que importa es la forma relativa, no la pendiente exacta en grados.
          preserveAspectRatio="none"
          className="h-12 w-full"
          role="img"
          aria-label={`${etiqueta}: tendencia ${resumen}, de ${formatRate(primero)} a ${formatRate(ultimo)} bolívares entre el ${formatFecha(desde)} y el ${formatFecha(hasta)}, en ${valores.length} lecturas`}
        >
          <polyline
            points={puntos.join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* El último punto marcado: es el valor de ahora, el que se busca. */}
          <circle
            cx={puntos[puntos.length - 1].split(",")[0]}
            cy={puntos[puntos.length - 1].split(",")[1]}
            r={3}
            fill="var(--accent)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* El eje de fechas. Solo los extremos: marcan hacia dónde avanza el
          tiempo, que es lo único que no se puede deducir mirando la línea. */}
      <div className="flex justify-between gap-2 text-xs text-[color:var(--muted)]">
        <span className="tabular">{formatFecha(desde)}</span>
        <span className="tabular">{formatFecha(hasta)}</span>
      </div>
    </figure>
  );
}
