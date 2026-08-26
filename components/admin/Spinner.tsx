/**
 * Ícono de "esto está en curso", para poner junto a un texto que ya cambia
 * solo ("Publicando…", "Guardando…"). El texto ya decía que había que
 * esperar; el spinner lo hace evidente de reojo, sin tener que leerlo —
 * importante en pantallas donde el botón queda arriba del scroll mientras
 * se revisa el resto del formulario.
 *
 * Puramente decorativo: no representa avance real (para eso está
 * `BarraProgreso`, que sí puede llevar porcentaje), así que no lleva
 * `role="progressbar"` ni valor. `aria-hidden` porque el estado ya lo dice
 * el texto que lo acompaña.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`animate-spin ${className ?? "size-4"}`}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
