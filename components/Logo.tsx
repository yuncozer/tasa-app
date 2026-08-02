/**
 * Taza de café: el logo juega con "tasa" y "taza".
 *
 * Va dibujada a mano en SVG en vez de usar el emoji ☕ porque así hereda el color
 * de acento del tema y se ve idéntica en todos los sistemas.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Decorativa: el <h1> de al lado ya dice "Tasapp".
      aria-hidden="true"
      focusable="false"
    >
      {/* Vapor */}
      <path d="M7.5 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M11 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M14.5 2.2c-.7.9-.7 1.8 0 2.7" />
      {/* Taza */}
      <path d="M3.5 8h13.5v5.6a5.2 5.2 0 0 1-5.2 5.2H8.7A5.2 5.2 0 0 1 3.5 13.6V8Z" />
      {/* Asa */}
      <path d="M17 9.6h1.3a2.6 2.6 0 0 1 0 5.2H17" />
      {/* Plato */}
      <path d="M2.5 21.3h16" />
    </svg>
  );
}
