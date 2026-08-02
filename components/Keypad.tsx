"use client";

/**
 * Teclado numérico propio.
 *
 * Se usa en lugar de un `<input>` para que en el teléfono no aparezca el teclado
 * del sistema tapando los resultados: la gracia de la app es ver el monto y sus
 * equivalentes al mismo tiempo.
 */

export type KeypadKey = string;

const KEYS: KeypadKey[] = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "back"];

interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  onClear: () => void;
}

export function Keypad({ onKey, onClear }: KeypadProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            aria-label={key === "back" ? "Borrar último dígito" : key === "," ? "Coma decimal" : key}
            className="tabular rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] py-4 text-2xl font-semibold text-[color:var(--foreground)] transition active:scale-95 active:bg-[color:var(--accent)]/20 sm:py-5"
          >
            {key === "back" ? "⌫" : key}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)] transition active:scale-95"
      >
        Limpiar
      </button>
    </div>
  );
}
