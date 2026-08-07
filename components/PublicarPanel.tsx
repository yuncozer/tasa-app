"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProgramadaVista } from "@/components/ColaProgramadas";
import { ColaProgramadas } from "@/components/ColaProgramadas";
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
export function PublicarPanel({ programadas }: { programadas: ProgramadaVista[] }) {
  const [destino, setDestino] = useState<Destino>("post");
  const router = useRouter();

  /**
   * La cola vive encima de los dos formularios porque es común a los dos, y la
   * lee el servidor: cuando uno de ellos programa algo, basta con volver a
   * pedir la página.
   */
  const alProgramar = () => router.refresh();

  const opciones: Array<{ valor: Destino; etiqueta: string }> = [
    { valor: "post", etiqueta: "Post" },
    { valor: "reel", etiqueta: "Reel" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ColaProgramadas programadas={programadas} />

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

      {destino === "post" ? (
        <PublicarNoticiaForm onProgramada={alProgramar} />
      ) : (
        <PublicarVideoForm onProgramada={alProgramar} />
      )}
    </div>
  );
}
