/**
 * Bandera de un país, dibujada a mano en SVG en vez de usar el emoji de
 * bandera del sistema operativo.
 *
 * Windows no dibuja esos glifos en su fuente de emoji (Segoe UI Emoji) y
 * muestra en su lugar las dos letras del país ("US", "CO"): sigue siendo
 * identificable, pero no como una bandera. Dibujándola nosotros mismos —igual
 * que `Logo.tsx` con la taza— se ve idéntica en cualquier sistema, sin
 * depender de qué fuente de emoji tenga instalada.
 */

type Pais = "US" | "EU" | "CO" | "VE";

const BLANCO = "#f1f5f9";

/** Puntos de un anillo elíptico de `cantidad` círculos, centrado en (cx, cy). */
function anillo(cx: number, cy: number, rx: number, ry: number, cantidad: number) {
  return Array.from({ length: cantidad }, (_, i) => {
    const angulo = (i / cantidad) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + rx * Math.cos(angulo), y: cy + ry * Math.sin(angulo) };
  });
}

function BanderaUS() {
  const altoFranja = 16 / 7;
  return (
    <>
      <rect width="24" height="16" fill={BLANCO} />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={i * 2 * altoFranja} width="24" height={altoFranja} fill="#b91c1c" />
      ))}
      <rect width="11" height="9" fill="#1d4ed8" />
      {Array.from({ length: 6 }, (_, i) => (
        <circle
          key={i}
          cx={2 + (i % 3) * 3.5}
          cy={2 + Math.floor(i / 3) * 4.5}
          r="0.6"
          fill={BLANCO}
        />
      ))}
    </>
  );
}

function BanderaEU() {
  return (
    <>
      <rect width="24" height="16" fill="#1d4ed8" />
      {anillo(12, 8, 5, 5, 12).map(({ x, y }, i) => (
        <circle key={i} cx={x} cy={y} r="0.6" fill="#fbbf24" />
      ))}
    </>
  );
}

function BanderaCO() {
  return (
    <>
      <rect width="24" height="8" fill="#facc15" />
      <rect y="8" width="24" height="4" fill="#1d4ed8" />
      <rect y="12" width="24" height="4" fill="#b91c1c" />
    </>
  );
}

function BanderaVE() {
  return (
    <>
      <rect width="24" height="5.33" fill="#facc15" />
      <rect y="5.33" width="24" height="5.33" fill="#1d4ed8" />
      <rect y="10.67" width="24" height="5.33" fill="#b91c1c" />
      {anillo(12, 8, 4.5, 1.9, 8).map(({ x, y }, i) => (
        <circle key={i} cx={x} cy={y} r="0.5" fill={BLANCO} />
      ))}
    </>
  );
}

const BANDERAS: Record<Pais, () => React.ReactElement> = {
  US: BanderaUS,
  EU: BanderaEU,
  CO: BanderaCO,
  VE: BanderaVE,
};

export function Flag({ pais, className }: { pais: Pais; className?: string }) {
  const Bandera = BANDERAS[pais];
  return (
    <svg
      viewBox="0 0 24 16"
      width="18"
      height="12"
      className={className}
      // Decorativa: el nombre de la moneda ya identifica el país al lado.
      aria-hidden="true"
      focusable="false"
    >
      <Bandera />
    </svg>
  );
}

export type { Pais };
