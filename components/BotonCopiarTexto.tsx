"use client";

import { useState } from "react";

/**
 * Textarea editable + botón de copiar para el mensaje del canal de WhatsApp.
 *
 * Editable y no de solo lectura a propósito: el texto generado es un punto de
 * partida, no lo definitivo — mismo criterio que `captionOverride` en
 * noticias, no forzar lo que arma la plantilla como si fuera intocable.
 * `navigator.clipboard` es la única razón de que esto sea cliente.
 */
export function BotonCopiarTexto({ textoInicial }: { textoInicial: string }) {
  const [texto, setTexto] = useState(textoInicial);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer salvo dejar el
      // texto seleccionable a mano.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        rows={10}
        className="whitespace-pre-wrap rounded-2xl border border-border-soft bg-surface px-4 py-3 text-sm leading-relaxed text-foreground"
      />
      <button
        type="button"
        onClick={copiar}
        className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95"
      >
        {copiado ? "Copiado" : "Copiar mensaje"}
      </button>
    </div>
  );
}
