/**
 * Bandera de un país, como imagen SVG en vez del emoji de bandera del
 * sistema operativo.
 *
 * Windows no dibuja esos glifos en su fuente de emoji (Segoe UI Emoji) y
 * muestra en su lugar las dos letras del país ("US", "CO"): sigue siendo
 * identificable, pero no como una bandera. Un SVG propio se ve idéntico en
 * cualquier sistema, sin depender de qué fuente de emoji tenga instalada.
 * Los archivos viven en `public/SVG/` y se sirven como estáticos.
 */

type Pais = "US" | "EU" | "CO" | "VE";

const ARCHIVO: Record<Pais, string> = {
  US: "/SVG/Flag-of-US.svg",
  EU: "/SVG/Flag-of-European-Union.svg",
  CO: "/SVG/Flag-of-Colombia.svg",
  VE: "/SVG/Flag-of-Venezuela.svg",
};

export function Flag({ pais, className }: { pais: Pais; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático y decorativo, no una foto que optimizar.
    <img
      src={ARCHIVO[pais]}
      alt=""
      width={18}
      height={12}
      className={className}
    />
  );
}

export type { Pais };
