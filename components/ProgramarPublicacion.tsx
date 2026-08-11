"use client";

import { useState } from "react";
import type { PublicacionPayload } from "@/lib/publish-news";
import { horaCaracasDesdeIso, isoDesdeHoraCaracas } from "@/lib/format";

type Estado =
  | { paso: "inicial" }
  | { paso: "confirmar" }
  | { paso: "enviando" }
  | { paso: "programada" }
  | { paso: "error"; mensaje: string };

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

/**
 * Deja el post en cola en vez de publicarlo ya. Lo comparten el formulario de
 * noticia y el de Reel, porque el post programado es el mismo objeto en los
 * dos casos: un `PublicacionPayload` y una hora.
 *
 * La hora se escribe y se lee **en hora de Caracas**, no en la del dispositivo
 * (ver `isoDesdeHoraCaracas`): desde Cúcuta el teléfono va en UTC−5 y un post
 * "de las 7" saldría corrido.
 *
 * `edicion`, si viene, cambia el destino: en vez de crear una fila nueva
 * (`POST /api/admin/programar`), guarda los cambios sobre la fila que ya
 * existe (`PATCH /api/admin/programadas`).
 *
 * La hora solo se prellena si todavía es futura: una `pendiente` siempre la
 * tiene así, pero una `fallida` falló justo a la hora a la que estaba puesta,
 * así que esa hora ya pasó y prellenarla solo confundiría ("¿por qué no me
 * deja guardar si no toqué nada?"). Con el campo vacío se puede guardar solo
 * el contenido corregido —la fila se queda `fallida`, lista para "Publicar
 * ahora" desde la cola— o escribir una hora nueva para reprogramarla.
 */
export function ProgramarPublicacion({
  payload,
  deshabilitado,
  onProgramada,
  edicion,
}: {
  /** `null` mientras el post todavía no está completo. */
  payload: PublicacionPayload | null;
  deshabilitado?: boolean;
  onProgramada: () => void;
  edicion?: { id: string; publicarEnInicial: string };
}) {
  const [cuando, setCuando] = useState(() => {
    if (!edicion) return "";
    const yaPaso = new Date(edicion.publicarEnInicial).getTime() <= Date.now();
    return yaPaso ? "" : horaCaracasDesdeIso(edicion.publicarEnInicial);
  });
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  const enviando = estado.paso === "enviando";
  const publicarEn = cuando ? isoDesdeHoraCaracas(cuando) : null;
  /**
   * En edición, dejarlo en blanco es válido —solo cambia el contenido—; si se
   * escribe algo, tiene que ser una hora futura, pero eso lo valida el
   * servidor (igual que en la creación, donde el `min` del input es solo una
   * ayuda visual): comprobarlo aquí contra la hora actual haría el render
   * impuro.
   */
  const listo = Boolean(payload) && (edicion ? cuando === "" || publicarEn !== null : Boolean(publicarEn)) && !deshabilitado;

  async function programar() {
    if (!payload) return;
    if (!edicion && !publicarEn) return;
    setEstado({ paso: "enviando" });
    try {
      const response = edicion
        ? await fetch("/api/admin/programadas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: edicion.id, payload, ...(publicarEn ? { publicarEn } : {}) }),
          })
        : await fetch("/api/admin/programar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload, publicarEn }),
          });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      if (!edicion) setCuando("");
      setEstado({ paso: "programada" });
      onProgramada();
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo conectar con el servidor" });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="programar-cuando" className="text-sm font-semibold uppercase tracking-wide text-muted">
        {edicion ? "Hora de publicación" : "O programarlo"}
      </label>

      <input
        id="programar-cuando"
        type="datetime-local"
        value={cuando}
        min={horaCaracasDesdeIso(new Date().toISOString())}
        onChange={(e) => {
          setCuando(e.target.value);
          setEstado({ paso: "inicial" });
        }}
        className="tabular rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base text-foreground outline-none"
      />
      <p className="text-xs text-muted">
        {edicion
          ? "Hora de Venezuela. Déjala en blanco para guardar solo el contenido, o elige una hora nueva para reprogramarla."
          : "Hora de Venezuela. Sale dentro de los diez minutos siguientes a la hora que elijas."}
      </p>

      {estado.paso === "error" && (
        <p className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
          {estado.mensaje}
        </p>
      )}

      {estado.paso === "programada" && (
        <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          {edicion
            ? "Los cambios quedaron guardados."
            : "Queda en cola. Puedes cancelarlo desde la lista de arriba hasta que salga."}
        </p>
      )}

      {estado.paso === "confirmar" ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3">
          <p className="text-sm text-warning">
            {edicion
              ? "¿Guardar los cambios? Reemplaza lo que había en cola para esta publicación."
              : "¿Dejarlo en cola? Saldrá solo en la cuenta real, sin volver a preguntar."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={programar}
              className="flex-1 rounded-xl border border-warning bg-warning/15 px-4 py-3 text-sm font-semibold text-warning transition active:scale-95"
            >
              {edicion ? "Sí, guardar" : "Sí, programar"}
            </button>
            <button
              type="button"
              onClick={() => setEstado({ paso: "inicial" })}
              className="flex-1 rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm font-semibold text-muted transition active:scale-95"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEstado({ paso: "confirmar" })}
          disabled={!listo || enviando}
          className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base font-semibold text-muted transition active:scale-95 disabled:opacity-50"
        >
          {enviando ? (edicion ? "Guardando…" : "Programando…") : edicion ? "Guardar cambios" : "Programar"}
        </button>
      )}
    </div>
  );
}
