"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";

/**
 * Copia una cifra al portapapeles.
 *
 * La app existe para responder "¿cuánto es esto en la otra moneda?", y la
 * respuesta casi siempre termina viajando por WhatsApp: sin esto hay que
 * transcribir el número a mano desde la pantalla, que es justo donde se cuela
 * un dígito cambiado.
 *
 * Copia **el número tal como se ve**, sin símbolo ni nombre de moneda: es la
 * misma regla que gobierna el resto del proyecto —lo que se muestra es lo que
 * se calcula— y un símbolo pegado estorba al reutilizar la cifra en otra
 * cuenta.
 *
 * Existe aparte de `components/BotonCopiarTexto.tsx`, que resuelve otra cosa:
 * aquél es el bloque editable del panel de administración, con su propia caja
 * y su textarea. Aquí solo hace falta un icono que quepa al lado de un monto.
 */
export function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      registrarEvento("copiar", etiqueta);
      // Vuelve solo a su estado normal: un "copiado" permanente deja de
      // significar que lo que hay guardado es esta cifra y no otra.
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer, y avisarlo con un
      // error rompería el gesto por algo que el usuario no puede resolver.
    }
  };

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={copiado ? `${etiqueta} copiado` : `Copiar ${etiqueta}`}
      className="shrink-0 rounded-full p-1.5 text-[color:var(--muted)] transition active:scale-95"
    >
      {copiado ? (
        <Check aria-hidden="true" className="size-4 text-[color:var(--accent)]" />
      ) : (
        <Copy aria-hidden="true" className="size-4 opacity-60" />
      )}
    </button>
  );
}
