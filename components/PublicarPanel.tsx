"use client";

import { useState } from "react";
import { PublicarNoticiaForm } from "@/components/PublicarNoticiaForm";
import { PublicarVideoForm } from "@/components/PublicarVideoForm";

type Destino = "post" | "reel";

/**
 * Elige el tipo de publicación antes de cargar nada, porque no es una
 * preferencia estética: un video dentro de un carrusel no es un Reel (Meta lo
 * excluye) y va en 1:1 para coincidir con la imagen de marca, mientras que un
 * Reel va solo y en 9:16. Cambiar de idea a mitad implicaría reencuadrar todo,
 * así que la decisión se toma al principio.
 */
export function PublicarPanel() {
  const [destino, setDestino] = useState<Destino>("post");

  const opciones: Array<{ valor: Destino; etiqueta: string }> = [
    { valor: "post", etiqueta: "Post" },
    { valor: "reel", etiqueta: "Reel" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">Tipo de publicación</span>
        <div className="flex gap-2" role="tablist" aria-label="Tipo de publicación">
          {opciones.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={destino === valor}
              onClick={() => setDestino(valor)}
              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition active:scale-95 ${
                destino === valor
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-soft bg-surface text-muted"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {destino === "post"
            ? "Una o varias imágenes, y opcionalmente un video, en un mismo carrusel cuadrado."
            : "Un solo video en 9:16. Es lo único que aparece en la pestaña de Reels."}
        </p>
      </div>

      {destino === "post" ? <PublicarNoticiaForm /> : <PublicarVideoForm />}
    </div>
  );
}
