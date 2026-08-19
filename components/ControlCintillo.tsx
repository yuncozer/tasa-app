"use client";

/**
 * Controles del cintillo de un video, compartidos por los tres sitios desde
 * los que se puede poner uno: el video principal de un carrusel, cada video
 * extra, y el Reel. Vive aparte porque son el mismo control y tienen que
 * comportarse igual en los tres.
 *
 * Sigue el patrón que ya usa el crédito de la fuente justo al lado:
 * `undefined` es "sin cintillo" y un objeto es "pedido", aunque el título esté
 * todavía en blanco. Eso es lo que distingue la casilla apagada de la
 * encendida y sin escribir.
 */

export interface Cintillo {
  titulo: string;
  /**
   * Intervalo en el que se ve el cintillo, en segundos. Sin `fin`, dura todo
   * el clip — es lo único que distingue "todo el video" de un intervalo,
   * porque `inicio` solo no basta (0 es un inicio válido). Sin `inicio`, el
   * intervalo empieza en el segundo 0: es el caso de "solo al principio" que
   * ya existía, ahora expresado como el mismo campo en vez de uno aparte.
   */
  inicio?: number;
  fin?: number;
}

/** Fin por defecto al pedir un intervalo, en segundos desde el inicio. */
const FIN_POR_DEFECTO = 6;

export function ControlCintillo({
  valor,
  onCambiar,
  deshabilitado,
  idPrefijo,
}: {
  valor: Cintillo | undefined;
  onCambiar: (valor: Cintillo | undefined) => void;
  deshabilitado?: boolean;
  /** Distingue los `id` cuando hay varios controles en la misma pantalla. */
  idPrefijo: string;
}) {
  const activo = valor !== undefined;
  const temporal = valor?.fin !== undefined;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={activo}
        disabled={deshabilitado}
        onClick={() => onCambiar(activo ? undefined : { titulo: "" })}
        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
          activo ? "border-accent bg-accent/15 text-accent" : "border-border-soft bg-surface text-muted"
        }`}
      >
        Poner cintillo
      </button>

      {activo && (
        <>
          <input
            id={`${idPrefijo}-titulo`}
            value={valor.titulo}
            onChange={(e) => onCambiar({ ...valor, titulo: e.target.value })}
            disabled={deshabilitado}
            placeholder="Titular del cintillo"
            aria-label="Titular del cintillo"
            className="rounded-xl border border-border-soft bg-surface-strong px-3 py-2 text-sm text-foreground outline-none disabled:opacity-50"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={temporal}
              disabled={deshabilitado}
              onClick={() =>
                onCambiar(
                  temporal
                    ? { titulo: valor.titulo }
                    : { ...valor, inicio: undefined, fin: FIN_POR_DEFECTO },
                )
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 disabled:opacity-50 ${
                temporal ? "border-accent text-accent" : "border-border-soft text-muted"
              }`}
            >
              {temporal ? "Todo el video" : "Intervalo"}
            </button>

            {temporal && (
              <>
                <label className="flex items-center gap-2 text-xs text-muted">
                  desde
                  <input
                    id={`${idPrefijo}-inicio`}
                    type="number"
                    min={0}
                    max={(valor.fin ?? FIN_POR_DEFECTO) - 1}
                    value={valor.inicio ?? 0}
                    onChange={(e) => onCambiar({ ...valor, inicio: Math.max(0, Number(e.target.value) || 0) })}
                    disabled={deshabilitado}
                    aria-label="Segundo en el que entra el cintillo"
                    className="tabular w-16 rounded-xl border border-border-soft bg-surface-strong px-2 py-1 text-sm text-foreground outline-none disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted">
                  hasta
                  <input
                    id={`${idPrefijo}-fin`}
                    type="number"
                    min={(valor.inicio ?? 0) + 1}
                    value={valor.fin}
                    onChange={(e) =>
                      onCambiar({ ...valor, fin: Math.max((valor.inicio ?? 0) + 1, Number(e.target.value) || 1) })
                    }
                    disabled={deshabilitado}
                    aria-label="Segundo en el que sale el cintillo"
                    className="tabular w-16 rounded-xl border border-border-soft bg-surface-strong px-2 py-1 text-sm text-foreground outline-none disabled:opacity-50"
                  />
                  segundos
                </label>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
