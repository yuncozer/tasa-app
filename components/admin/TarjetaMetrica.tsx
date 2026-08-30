import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { formatEntero, formatVariacion } from "@/lib/format";

/**
 * Una cifra del panel de analíticas: qué mide, cuánto vale y el contexto que
 * la hace legible.
 *
 * La jerarquía es la de siempre —el número manda, todo lo demás va en
 * `--muted`— pero aquí las tarjetas se leen **en fila y de reojo**, no de una
 * en una, y eso impone dos cosas que una tarjeta suelta no necesita:
 *
 * - **Todas ocupan lo mismo.** `h-full` más el `mt-auto` del pie alinean las
 *   cifras entre sí aunque una etiqueta ocupe dos líneas y la de al lado una:
 *   sin eso, los números quedaban a alturas distintas y la fila se leía como
 *   una escalera. La etiqueta reserva dos líneas (`min-h`) por el mismo
 *   motivo.
 * - **El ícono identifica la métrica antes que el texto.** En una fila de
 *   cuatro o cinco cifras casi iguales, la forma es lo que se distingue de un
 *   vistazo; la etiqueta confirma. Va en su propia pastilla tintada, el mismo
 *   recurso que ya usan las tarjetas del dashboard de `/admin`, para que las
 *   dos pantallas se lean como el mismo panel.
 *
 * La etiqueta va en versalitas con `tracking-wide`: es la escala de
 * "encabezado de sección" de `ESTILOS.md`, y a este tamaño ordena la fila sin
 * competir con la cifra. Nada de sombras ni de degradados — el contraste lo
 * pone el fondo, como en el resto del proyecto.
 *
 * `formatEntero` devuelve "—" cuando no hay dato, así que un cero de verdad y
 * una métrica que la fuente no expone no se leen igual: la misma regla que
 * `Sin comparación` en el reporte semanal.
 */
/**
 * La variación contra el período anterior.
 *
 * `mejorSiSube` existe porque el color no puede salir del signo: en las
 * métricas de redes subir es bueno, mientras que en una tasa subir es una
 * devaluación —por eso el reporte semanal pinta de rojo lo que sube—. Aquí se
 * dice explícitamente para no heredar por accidente el criterio contrario.
 */
export interface VariacionMetrica {
  /** En porcentaje sobre el período anterior; `null` si no hay con qué comparar. */
  porcentaje: number | null;
  mejorSiSube?: boolean;
}

export function TarjetaMetrica({
  etiqueta,
  valor,
  apoyo,
  icono: Icono,
  variacion,
}: {
  etiqueta: string;
  valor: number | null | undefined;
  apoyo?: string;
  icono?: LucideIcon;
  variacion?: VariacionMetrica;
}) {
  const cambio = variacion?.porcentaje ?? null;
  const sube = cambio !== null && cambio > 0;
  const plano = cambio !== null && Math.abs(cambio) < 0.5;
  const bueno = variacion?.mejorSiSube === false ? !sube : sube;
  const Flecha = sube ? ArrowUp : ArrowDown;
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-h-8 text-xs font-semibold uppercase leading-4 tracking-wide text-muted">
          {etiqueta}
        </p>
        {Icono && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Icono aria-hidden="true" className="size-3.5" />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <p className="tabular text-2xl font-semibold leading-none sm:text-3xl">
          {formatEntero(valor)}
        </p>

        {/* Sin comparación no se pinta nada: un "0 %" diría que no cambió,
            que es distinto de no saberlo — la misma regla que `Sin
            comparación` en el reporte semanal. */}
        {cambio !== null &&
          (plano ? (
            <span className="text-xs text-muted">igual</span>
          ) : (
            <span
              className={`flex items-center gap-0.5 text-xs font-medium ${
                bueno ? "text-accent" : "text-warning"
              }`}
            >
              <Flecha aria-hidden="true" className="size-3" />
              <span className="tabular">{formatVariacion(cambio, "porcentaje")}</span>
            </span>
          ))}
      </div>

      {apoyo && <p className="mt-auto text-xs leading-4 text-muted">{apoyo}</p>}
    </div>
  );
}
