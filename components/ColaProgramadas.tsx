"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/admin/Spinner";
import type { PublicacionPayload } from "@/lib/publish-news";
import { formatClock, formatDate, horaCaracasDesdeIso, isoDesdeHoraCaracas } from "@/lib/format";

/** Espera entre cada sondeo de "Publicar ahora", para no encadenar peticiones sin pausa. */
const PAUSA_ENTRE_SONDEOS_MS = 1_000;

export interface ProgramadaVista {
  id: string;
  publicarEn: string;
  estado: "pendiente" | "publicando" | "publicada" | "fallida";
  error: string | null;
  /** Con qué nombre se reconoce la fila (ver `resumenPublicacion`). */
  resumen: string;
}

/**
 * La cola de publicaciones que todavía no han salido, con su hora y los
 * botones para manejarlas. Sin esto, equivocarse de hora no tendría arreglo
 * desde el teléfono.
 *
 * Cada fila lleva debajo de la hora un fragmento de su título: dos posts
 * programados con pocos minutos de diferencia se veían idénticos, y cancelar o
 * mover el equivocado era cuestión de suerte. Se recorta con `truncate` en vez
 * de a un número fijo de caracteres — así aprovecha el ancho que haya.
 *
 * A una `pendiente` se le puede cambiar la hora sin rehacer el post: el
 * contenido se congeló al programarlo y sigue valiendo, así que lo único que se
 * mueve es cuándo sale. El editor se abre con la hora que ya tenía, porque lo
 * habitual es corregirla, no escribirla de cero.
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
 *
 * "Editar" es la excepción a "solo se actúa": pide el payload completo de la
 * fila (la lista solo trae el `resumen`) y lo sube al padre, que es quien
 * decide qué formulario reabrir con ese contenido.
 */
export function ColaProgramadas({
  programadas,
  onEditar,
}: {
  programadas: ProgramadaVista[];
  onEditar: (datos: { id: string; payload: PublicacionPayload; publicarEn: string }) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** Qué fila se está publicando ahora mismo desde aquí, y en qué va. */
  const [enCurso, setEnCurso] = useState<{ id: string; texto: string } | null>(null);
  /**
   * Qué fila se está reprogramando y con qué hora. Solo una a la vez: el editor
   * se abre en su propia fila y con la hora que ya tenía, que es lo que se suele
   * querer corregir —mover media hora, no escribir la fecha de cero—.
   */
  const [editando, setEditando] = useState<{ id: string; cuando: string } | null>(null);

  async function cambiarHora() {
    if (!editando) return;
    const publicarEn = isoDesdeHoraCaracas(editando.cuando);
    if (!publicarEn) {
      setError("Esa fecha no es válida");
      return;
    }

    try {
      const response = await fetch("/api/admin/programadas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editando.id, publicarEn }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Error ${response.status}`);
      } else {
        setError(null);
        setEditando(null);
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    }
    router.refresh();
  }

  async function editar(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/programadas/${id}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? `Error ${response.status}`);
        return;
      }
      onEditar(body as { id: string; payload: PublicacionPayload; publicarEn: string });
    } catch {
      setError("No se pudo conectar con el servidor");
    }
  }

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
      // El servidor ya se toma su propio margen internamente mientras Meta
      // procesa; esta pausa es solo para no encadenar peticiones del
      // navegador tan rápido como el servidor conteste.
      await new Promise((resolver) => setTimeout(resolver, PAUSA_ENTRE_SONDEOS_MS));
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
            <li key={programada.id} className="flex flex-col gap-2 px-4 py-3">
              {/* `flex-wrap` + la fecha sin partir: en un teléfono, tres
                  píldoras junto a la hora no caben en una línea, y antes lo que
                  cedía era la fecha, que se rompía en dos. Ahora se mantiene
                  entera y son los botones los que bajan.
                  El `min-w-48` es lo que provoca ese salto: sin un mínimo, la
                  columna se encoge por debajo de la fecha y, al no poder
                  partirla, esta se sale de su caja por debajo de los botones. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <span className="tabular whitespace-nowrap text-sm font-medium">
                    {formatDate(programada.publicarEn)} · {formatClock(programada.publicarEn)}
                  </span>
                  {/* Con qué post se corresponde la hora. Va en una sola línea y
                      recortado por CSS: a igual hora, dos filas se distinguen
                      por aquí, y el titular entero no cabe en un teléfono. */}
                  <span className="truncate text-xs text-muted">{programada.resumen}</span>
                  {/* `formatRelative` no vale aquí — está hecho para la fecha
                      valor de una tasa y diría "vigente hoy". */}
                  {enCurso?.id === programada.id ? (
                    <span className="flex items-center gap-1.5 text-xs text-accent">
                      <Spinner className="size-3" />
                      {enCurso.texto}
                    </span>
                  ) : programada.estado === "fallida" ? (
                    <span className="text-xs text-warning">No salió: {programada.error ?? "error desconocido"}</span>
                  ) : programada.estado === "publicando" ? (
                    <span className="flex items-center gap-1.5 text-xs text-warning">
                      <Spinner className="size-3" />
                      Publicándose ahora mismo
                    </span>
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
                    {/* `pendiente` o `fallida`: ninguna de las dos está en
                        manos de Meta ahora mismo. Reabre el mismo formulario
                        con el contenido ya cargado — sirve tanto para
                        corregir algo como para copiar el título o el caption
                        y publicarlos a mano si hiciera falta. Una
                        `publicando` no se toca: puede estar en vuelo. */}
                    {(programada.estado === "pendiente" || programada.estado === "fallida") && (
                      <button
                        type="button"
                        onClick={() => void editar(programada.id)}
                        disabled={enCurso !== null}
                        className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-40"
                      >
                        Editar
                      </button>
                    )}
                    {/* Solo una `pendiente`: una `publicando` puede estar ya en
                        manos de Meta, y a una `fallida` moverle solo la hora no
                        la devuelve a la cola — para eso está "Editar", que ya
                        deja poner una hora nueva junto con el contenido. */}
                    {programada.estado === "pendiente" && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditando(
                            editando?.id === programada.id
                              ? null
                              : { id: programada.id, cuando: horaCaracasDesdeIso(programada.publicarEn) },
                          )
                        }
                        disabled={enCurso !== null}
                        aria-expanded={editando?.id === programada.id}
                        className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-40"
                      >
                        {editando?.id === programada.id ? "Cerrar" : "Cambiar hora"}
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
              </div>

              {editando?.id === programada.id && (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`hora-${programada.id}`} className="text-xs text-muted">
                    Nueva hora, en hora de Venezuela
                  </label>
                  <input
                    id={`hora-${programada.id}`}
                    type="datetime-local"
                    value={editando.cuando}
                    min={horaCaracasDesdeIso(new Date().toISOString())}
                    onChange={(e) => setEditando({ id: programada.id, cuando: e.target.value })}
                    className="tabular rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base text-foreground outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void cambiarHora()}
                    className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition active:scale-95"
                  >
                    Guardar la hora
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
