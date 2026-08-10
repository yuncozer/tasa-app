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
  /** Sin valor, el cintillo dura todo el clip. */
  segundos?: number;
}

/** Duración por defecto al pedir que el cintillo entre y salga, en segundos. */
const SEGUNDOS_POR_DEFECTO = 6;

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
  const temporal = valor?.segundos !== undefined;

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

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={temporal}
              disabled={deshabilitado}
              onClick={() =>
                onCambiar({ ...valor, segundos: temporal ? undefined : SEGUNDOS_POR_DEFECTO })
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 disabled:opacity-50 ${
                temporal ? "border-accent text-accent" : "border-border-soft text-muted"
              }`}
            >
              {temporal ? "Solo al principio" : "Todo el video"}
            </button>

            {temporal && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  id={`${idPrefijo}-segundos`}
                  type="number"
                  min={1}
                  max={60}
                  value={valor.segundos}
                  onChange={(e) => onCambiar({ ...valor, segundos: Number(e.target.value) || 1 })}
                  disabled={deshabilitado}
                  aria-label="Segundos que dura el cintillo"
                  className="tabular w-16 rounded-xl border border-border-soft bg-surface-strong px-2 py-1 text-sm text-foreground outline-none disabled:opacity-50"
                />
                segundos
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}
