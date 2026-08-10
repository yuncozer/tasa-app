"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatClock, formatDate } from "@/lib/format";

export interface ProgramadaVista {
  id: string;
  publicarEn: string;
  estado: "pendiente" | "publicando" | "publicada" | "fallida";
  error: string | null;
}

/**
 * La cola de publicaciones que todavía no han salido, con su hora y los
 * botones para manejarlas. Sin esto, equivocarse de hora no tendría arreglo
 * desde el teléfono.
 *
 * Las ya publicadas no se listan —su confirmación es el post en Instagram—,
 * pero las fallidas sí, con el motivo: es la única forma de enterarse de que
 * algo no salió, porque nadie estaba mirando cuando el cron lo intentó. Y
 * llevan sus dos botones, que es lo que faltaba: reintentar en el momento o
 * quitarla de en medio.
 *
 * "Publicar ahora" no publica de una sola llamada: pide un paso, muestra en
 * qué va y vuelve a pedir otro. Es el mismo worker que usa el cron, y se hace
 * así porque un carrusel con video no cabe en el tope de tiempo de una
 * función.
 *
 * La lista la lee el servidor y llega por props; aquí solo se actúa y se pide
 * `router.refresh()`. Leerla con `setState` dentro de un efecto es lo que
 * dispara el linter de React, y el proyecto ya evita ese patrón en otros
 * sitios.
 */
export function ColaProgramadas({ programadas }: { programadas: ProgramadaVista[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** Qué fila se está publicando ahora mismo desde aquí, y en qué va. */
  const [enCurso, setEnCurso] = useState<{ id: string; texto: string } | null>(null);

  async function eliminar(id: string) {
    try {
      const response = await fetch(`/api/admin/programadas?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Error ${response.status}`);
      } else {
        setError(null);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    }
    router.refresh();
  }

  async function publicarAhora(id: string) {
    setError(null);
    setEnCurso({ id, texto: "Preparando el contenido…" });

    // Cada llamada avanza un trozo y contesta por dónde va. Se repite hasta que
    // termina: el navegador es quien mueve la publicación mientras esté abierto,
    // y si se cierra, el cron la retoma igual desde donde quedó.
    for (;;) {
      let datos: { estado?: string; fase?: string; texto?: string; error?: string } | null = null;
      try {
        const response = await fetch("/api/admin/programadas/avanzar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        datos = await response.json().catch(() => null);
        if (!response.ok) {
          setError(datos?.error ?? `Error ${response.status}`);
          break;
        }
      } catch {
        setError("No se pudo conectar con el servidor");
        break;
      }

      if (datos?.estado === "publicada") break;
      if (datos?.estado === "fallida") {
        setError(datos.error ?? "No se pudo publicar");
        break;
      }
      setEnCurso({ id, texto: datos?.texto ?? "Publicando…" });
    }

    setEnCurso(null);
    router.refresh();
  }

  // Sin nada en cola no se ocupa sitio: la pantalla es un teléfono y lo que
  // importa es el formulario.
  if (programadas.length === 0 && !error) return null;

  return (
    <section aria-labelledby="cola-programadas" className="flex flex-col gap-3">
      <h2 id="cola-programadas" className="text-sm font-semibold uppercase tracking-wide text-muted">
        En cola
      </h2>

      {error && (
        <p className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">{error}</p>
      )}

      {programadas.length > 0 && (
        <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface">
          {programadas.map((programada) => (
            <li key={programada.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="tabular text-sm font-medium">
                  {formatDate(programada.publicarEn)} · {formatClock(programada.publicarEn)}
                </span>
                {/* Una pendiente no lleva segunda línea: su fecha y su hora ya
                    lo dicen todo. `formatRelative` no vale aquí — está hecho
                    para la fecha valor de una tasa y diría "vigente hoy". */}
                {enCurso?.id === programada.id ? (
                  <span className="text-xs text-accent">{enCurso.texto}</span>
                ) : programada.estado === "fallida" ? (
                  <span className="text-xs text-warning">No salió: {programada.error ?? "error desconocido"}</span>
                ) : programada.estado === "publicando" ? (
                  <span className="text-xs text-warning">Publicándose ahora mismo</span>
                ) : null}
              </div>

              {enCurso?.id !== programada.id && (
                <div className="flex shrink-0 items-center gap-2">
                  {programada.estado === "fallida" && (
                    <button
                      type="button"
                      onClick={() => void publicarAhora(programada.id)}
                      disabled={enCurso !== null}
                      className="rounded-full border border-accent/40 px-3 py-1 text-xs font-medium text-accent transition active:scale-95 disabled:opacity-40"
                    >
                      Publicar ahora
                    </button>
                  )}
                  {(programada.estado === "pendiente" || programada.estado === "fallida") && (
                    <button
                      type="button"
                      onClick={() => void eliminar(programada.id)}
                      disabled={enCurso !== null}
                      aria-label={
                        programada.estado === "fallida"
                          ? "Quitar esta publicación de la cola"
                          : "Cancelar esta publicación programada"
                      }
                      className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-40"
                    >
                      {programada.estado === "fallida" ? "Eliminar" : "Cancelar"}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
