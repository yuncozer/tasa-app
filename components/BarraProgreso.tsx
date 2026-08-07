import type { FaseSubida } from "@/lib/subida";

/**
 * Avance de una subida. Dos formas según lo que de verdad se puede saber:
 *
 * - **Con porcentaje** mientras el archivo viaja del teléfono al servidor, que
 *   es el único tramo que el navegador puede medir.
 * - **Indeterminada** mientras el servidor sube a Cloudinary y aplica la marca:
 *   ahí no llega ningún dato de avance, así que la barra se mueve sin cifra y
 *   el texto dice qué está pasando. Estimar un porcentaje ahí sería inventar un
 *   número, que es justo lo que esta app no hace.
 *
 * La animación indeterminada reutiliza `.barra-splash` de `globals.css` — la
 * misma del splash, con su `prefers-reduced-motion` ya resuelto.
 */
export function BarraProgreso({ fase, etiqueta }: { fase: FaseSubida; etiqueta: string }) {
  const enviando = fase.tipo === "enviando";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">{etiqueta}</span>
        {enviando && <span className="tabular text-xs text-muted">{fase.porcentaje} %</span>}
      </div>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={enviando ? 0 : undefined}
        aria-valuemax={enviando ? 100 : undefined}
        aria-valuenow={enviando ? fase.porcentaje : undefined}
        className="h-1 w-full overflow-hidden rounded-full bg-surface-strong"
      >
        {enviando ? (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${fase.porcentaje}%` }}
          />
        ) : (
          <div className="barra-splash h-full w-1/3 rounded-full bg-accent" />
        )}
      </div>
    </div>
  );
}
