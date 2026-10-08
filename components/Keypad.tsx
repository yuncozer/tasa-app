"use client";

import { Delete } from "lucide-react";

/**
 * Teclado numérico propio.
 *
 * Se usa en lugar de un `<input>` para que en el teléfono no aparezca el teclado
 * del sistema tapando los resultados: la gracia de la app es ver el monto y sus
 * equivalentes al mismo tiempo.
 *
 * Lleva una cuarta columna con las cuatro operaciones, para quien necesita
 * sumar unos precios o multiplicar por cantidades antes de convertir y no
 * tenga que abrir otra calculadora. Va **en una columna aparte y con otro
 * fondo** que los dígitos: es la parte secundaria del teclado, y quien solo
 * teclea un monto no tiene por qué notarla. No hay tecla "=": el resultado ya
 * está siempre a la vista y las equivalencias se actualizan con él.
 *
 * Debajo van las dos teclas que actúan sobre la cuenta entera —**Limpiar**
 * (todo) y **Borrar** (el último carácter)— juntas, una al lado de la otra: son
 * la misma idea a dos escalas. Borrar estaba dentro de la cuadrícula de
 * dígitos y, con la columna de operaciones, se perdía entre ellas.
 */

export type KeypadKey = string;

/**
 * Por filas, de izquierda a derecha: tres columnas de dígitos y la de
 * operaciones. El orden de los operadores es el de cualquier calculadora de
 * teléfono, de arriba abajo: dividir, multiplicar, restar, sumar. El "0" ocupa
 * dos columnas, como en la calculadora del teléfono, para llenar el sitio que
 * dejó la tecla de borrar.
 */
const KEYS: KeypadKey[] = [
  "7", "8", "9", "÷",
  "4", "5", "6", "×",
  "1", "2", "3", "−",
  ",", "0", "+",
];

const ETIQUETAS: Record<string, string> = {
  ",": "Coma decimal",
  "÷": "Dividir",
  "×": "Multiplicar",
  "−": "Restar",
  "+": "Sumar",
};

interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  onClear: () => void;
  /** Operador con el que termina la cuenta, si hay uno esperando su segundo operando. */
  operadorPendiente?: string | null;
}

const TECLA_SECUNDARIA =
  "flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] py-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)] transition active:scale-95";

export function Keypad({ onKey, onClear, operadorPendiente }: KeypadProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map((key) => {
          const esOperador = "÷×−+".includes(key);
          const pendiente = esOperador && key === operadorPendiente;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              aria-label={ETIQUETAS[key] ?? key}
              // El operador que espera su segundo número se marca, igual que un
              // chip seleccionado: así se ve que lo siguiente que se teclee es
              // el otro lado de la cuenta.
              aria-pressed={esOperador ? pendiente : undefined}
              className={`tabular rounded-xl border py-4 text-2xl font-semibold transition active:scale-95 sm:py-5 ${
                key === "0" ? "col-span-2" : ""
              } ${
                pendiente
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                  : esOperador
                    ? "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] active:bg-[color:var(--accent)]/20"
                    : "border-[color:var(--border)] bg-[color:var(--surface-strong)] text-[color:var(--foreground)] active:bg-[color:var(--accent)]/20"
              }`}
            >
              {key}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClear} className={TECLA_SECUNDARIA}>
          Limpiar
        </button>

        <button
          type="button"
          onClick={() => onKey("back")}
          aria-label="Borrar último dígito"
          className={TECLA_SECUNDARIA}
        >
          <Delete aria-hidden="true" className="size-4" />
          Borrar
        </button>
      </div>
    </div>
  );
}
