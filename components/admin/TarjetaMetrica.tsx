import { formatEntero } from "@/lib/format";

/**
 * Una cifra del panel de analíticas con su etiqueta y, debajo, el contexto que
 * la hace legible.
 *
 * Es la receta de superficie de `ESTILOS.md` con la jerarquía de siempre: el
 * número manda y todo lo demás va en `--muted`. `formatEntero` devuelve "—"
 * cuando no hay dato, así que un cero de verdad y una métrica que la fuente no
 * expone no se leen igual — la misma regla que `Sin comparación` en el reporte
 * semanal.
 */
export function TarjetaMetrica({
  etiqueta,
  valor,
  apoyo,
}: {
  etiqueta: string;
  valor: number | null | undefined;
  apoyo?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border-soft bg-surface px-4 py-3 sm:py-4">
      <p className="text-xs text-muted">{etiqueta}</p>
      <p className="tabular text-2xl font-semibold leading-none sm:text-3xl">
        {formatEntero(valor)}
      </p>
      {apoyo && <p className="text-xs text-muted">{apoyo}</p>}
    </div>
  );
}
