"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Si este navegador sabe abrir el selector nativo de "Compartir".
 *
 * Mismo patrón que `hayPortapapeles` en `Calculator.tsx`: se consulta con
 * `useSyncExternalStore` porque en el servidor no existe `navigator`, y no
 * hay a qué suscribirse porque la capacidad no cambia mientras la página
 * vive. Sin `Web Share API` el botón no se muestra en vez de mostrarse roto
 * — un botón que nunca funciona es peor que no tenerlo.
 */
const sinCambios = () => () => {};
const hayShareApi = () => typeof navigator?.share === "function";
const noEnServidor = () => false;

/**
 * Textarea editable + botones de copiar/compartir para el mensaje del canal
 * de WhatsApp.
 *
 * Editable y no de solo lectura a propósito: el texto generado es un punto de
 * partida, no lo definitivo — mismo criterio que `captionOverride` en
 * noticias, no forzar lo que arma la plantilla como si fuera intocable.
 * "Compartir" abre el selector nativo del sistema con WhatsApp como una
 * opción directa, sin pasar por copiar y cambiar de app a mano; "Copiar
 * mensaje" se queda como respaldo universal, que es lo único que hay en
 * navegadores sin `navigator.share` (la mayoría de escritorio).
 */
export function BotonCopiarTexto({ textoInicial }: { textoInicial: string }) {
  const [texto, setTexto] = useState(textoInicial);
  const [copiado, setCopiado] = useState(false);
  const puedeCompartir = useSyncExternalStore(sinCambios, hayShareApi, noEnServidor);

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

  async function compartir() {
    try {
      await navigator.share({ text: texto });
    } catch {
      // Cancelar el selector del sistema también lanza aquí: no es un error.
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
      {puedeCompartir && (
        <button
          type="button"
          onClick={compartir}
          className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95"
        >
          Compartir
        </button>
      )}
      <button
        type="button"
        onClick={copiar}
        className={
          puedeCompartir
            ? "rounded-2xl border border-border-soft bg-surface px-4 py-3 text-sm font-semibold text-foreground transition active:scale-95"
            : "rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95"
        }
      >
        {copiado ? "Copiado" : "Copiar mensaje"}
      </button>
    </div>
  );
}
