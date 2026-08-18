"use client";

import { useState } from "react";

/**
 * Botón que le pide a la IA un texto y lo entrega para revisarlo.
 *
 * Es el único sitio de la interfaz desde donde se dispara la IA, y se dispara
 * **al pulsarlo**: nunca al abrir una pantalla. Dos motivos, y los dos importan.
 * Uno, los modelos gratuitos de OpenRouter tienen cuota, y una llamada por cada
 * vez que se abre `/admin` la gastaría sin que nadie la haya pedido. Dos, lo que
 * devuelve un modelo hay que leerlo antes de publicarlo: si apareciera solo,
 * acabaría saliendo sin que nadie lo mire.
 *
 * El texto siempre cae en un campo editable del formulario que lo llama. Aquí no
 * se publica nada.
 */

type Estado =
  | { paso: "inicial" }
  | { paso: "pidiendo" }
  | { paso: "listo" }
  | { paso: "sin-modelo" }
  | { paso: "error"; mensaje: string };

export function BotonRedactarIa({
  etiqueta,
  cuerpo,
  onTexto,
  deshabilitado,
}: {
  etiqueta: string;
  /** El cuerpo de la petición, o `null` si todavía faltan datos que enviar. */
  cuerpo: () => Record<string, unknown> | null;
  onTexto: (texto: string) => void;
  deshabilitado?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });
  const pidiendo = estado.paso === "pidiendo";

  async function redactar() {
    const body = cuerpo();
    if (!body) return;

    setEstado({ paso: "pidiendo" });
    try {
      const response = await fetch("/api/admin/redactar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detalle = await response.json().catch(() => null);
        setEstado({ paso: "error", mensaje: detalle?.error ?? `Error ${response.status}` });
        return;
      }

      const { texto } = await response.json();
      // `texto: null` con 200 no es un fallo: es la degradación prevista cuando
      // ningún modelo gratuito respondió. Lo que había escrito se queda.
      if (typeof texto !== "string") {
        setEstado({ paso: "sin-modelo" });
        return;
      }

      onTexto(texto);
      setEstado({ paso: "listo" });
    } catch (error) {
      setEstado({ paso: "error", mensaje: error instanceof Error ? error.message : "Fallo de red" });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={redactar}
        disabled={pidiendo || deshabilitado}
        className="self-start rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-50"
      >
        {pidiendo ? "Redactando…" : etiqueta}
      </button>

      {estado.paso === "listo" && (
        <p className="text-xs text-muted">Redactado con IA. Léelo y corrígelo antes de publicar.</p>
      )}
      {estado.paso === "sin-modelo" && (
        <p className="text-xs text-warning">
          Ningún modelo respondió (suele ser la cuota del plan gratuito). Se mantiene el texto de plantilla.
        </p>
      )}
      {estado.paso === "error" && <p className="text-xs text-warning">{estado.mensaje}</p>}
    </div>
  );
}
