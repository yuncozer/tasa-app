import { formatRate } from "@/lib/format";

/**
 * La forma de una serie de tasas, en una línea.
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
 * No lleva ejes, ni rejilla, ni marcas: es un indicio de forma, no un gráfico
 * de análisis. Las cifras exactas están justo debajo, en la lista.
 */

const ANCHO = 300;
const ALTO = 48;
/** Aire arriba y abajo para que el trazo no se corte contra el borde. */
const MARGEN = 4;

export function Sparkline({
  valores,
  etiqueta,
}: {
  /** La serie en orden **cronológico**: el más antiguo primero. */
  valores: number[];
  /** Qué serie es, para quien no puede ver la línea. */
  etiqueta: string;
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
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      // Se estira al ancho disponible y no conserva la proporción a propósito:
      // lo que importa es la forma relativa, no la pendiente exacta en grados.
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-label={`${etiqueta}: tendencia ${resumen}, de ${formatRate(primero)} a ${formatRate(ultimo)} bolívares en las últimas ${valores.length} lecturas`}
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
  );
}
