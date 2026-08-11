"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProgramadaVista } from "@/components/ColaProgramadas";
import { ColaProgramadas } from "@/components/ColaProgramadas";
import { PublicarNoticiaForm } from "@/components/PublicarNoticiaForm";
import { PublicarVideoForm } from "@/components/PublicarVideoForm";
import type { PublicacionPayload } from "@/lib/publish-news";

type Destino = "post" | "reel";

interface Edicion {
  id: string;
  payload: PublicacionPayload;
  publicarEn: string;
}

/**
 * Elige el tipo de publicación antes de cargar nada, porque no es una
 * preferencia estética: un video dentro de un carrusel no es un Reel (Meta lo
 * excluye) y va en 1:1 para coincidir con la imagen de marca, mientras que un
 * Reel va solo y en 9:16. Cambiar de idea a mitad implicaría reencuadrar todo,
 * así que la decisión se toma al principio.
 *
 * Editar una programada reutiliza el mismo par de formularios: el `destino`
 * se fuerza según el tipo del payload guardado, y el formulario se remonta
 * con una `key` distinta por fila —así el estado inicial se siembra una sola
 * vez con lo que trae la edición, sin depender de un efecto que lo reponga en
 * cada cambio.
 */
export function PublicarPanel({ programadas }: { programadas: ProgramadaVista[] }) {
  const [destino, setDestino] = useState<Destino>("post");
  const [editando, setEditando] = useState<Edicion | null>(null);
  const router = useRouter();

  /**
   * La cola vive encima de los dos formularios porque es común a los dos, y la
   * lee el servidor: cuando uno de ellos programa algo, basta con volver a
   * pedir la página. También cierra la edición en curso, si había una: tanto
   * al programar de cero como al guardar cambios, lo que sigue es volver al
   * formulario en blanco.
   */
  const alProgramar = () => {
    router.refresh();
    setEditando(null);
  };

  function editar(datos: Edicion) {
    setDestino(datos.payload.tipo === "reel" ? "reel" : "post");
    setEditando(datos);
  }

  const opciones: Array<{ valor: Destino; etiqueta: string }> = [
    { valor: "post", etiqueta: "Post" },
    { valor: "reel", etiqueta: "Reel" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ColaProgramadas programadas={programadas} onEditar={editar} />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">Tipo de publicación</span>
        <div className="flex gap-2" role="tablist" aria-label="Tipo de publicación">
          {opciones.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={destino === valor}
              onClick={() => {
                setDestino(valor);
                setEditando(null);
              }}
              disabled={editando !== null}
              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${
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
        <PublicarNoticiaForm
          key={editando?.id ?? "nuevo-post"}
          onProgramada={alProgramar}
          edicion={editando ?? undefined}
          onCancelarEdicion={() => setEditando(null)}
        />
      ) : (
        <PublicarVideoForm
          key={editando?.id ?? "nuevo-reel"}
          onProgramada={alProgramar}
          edicion={
            editando && editando.payload.tipo === "reel"
              ? { id: editando.id, payload: editando.payload, publicarEn: editando.publicarEn }
              : undefined
          }
          onCancelarEdicion={() => setEditando(null)}
        />
      )}
    </div>
  );
}
