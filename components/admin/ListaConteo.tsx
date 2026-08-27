import { formatEntero } from "@/lib/format";

/**
 * Un desglose ordenado —rutas, monedas, referentes— con una barra de fondo
 * proporcional al primero de la lista.
 *
 * La barra no es decoración: una columna de números ordenados dice el orden
 * pero no la distancia, y aquí la pregunta suele ser "¿esto domina o está
 * repartido?". Va como fondo de la fila y no como elemento aparte para que no
 * le quite sitio al número, que sigue mandando.
 */
export function ListaConteo({
  titulo,
  filas,
  vacio = "Sin datos en este período.",
  etiquetar,
}: {
  titulo: string;
  filas: { clave: string; total: number }[];
  vacio?: string;
  /** Traduce la clave cruda a algo legible; por defecto se muestra tal cual. */
  etiquetar?: (clave: string) => string;
}) {
  const maximo = filas.length > 0 ? Math.max(...filas.map((fila) => fila.total)) : 0;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{titulo}</h3>

      {filas.length === 0 ? (
        <p className="text-sm text-muted">{vacio}</p>
      ) : (
        <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface">
          {filas.map((fila) => (
            <li key={fila.clave} className="relative flex items-center justify-between gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-accent/10"
                style={{ width: `${maximo === 0 ? 0 : (fila.total / maximo) * 100}%` }}
              />
              <span className="relative min-w-0 truncate text-sm font-medium">
                {etiquetar ? etiquetar(fila.clave) : fila.clave}
              </span>
              <span className="tabular relative text-sm font-semibold">{formatEntero(fila.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
