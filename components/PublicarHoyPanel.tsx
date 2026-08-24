"use client";

import { useState } from "react";

/**
 * Botón de `/admin/hoy`: dispara el carrusel diario de tasas fuera de las
 * horas fijas del cron. Sin campos que editar, como `/admin/semanal` — la
 * única decisión es publicar o no.
 */

type Estado =
  | { paso: "inicial" }
  | { paso: "publicando" }
  | { paso: "publicado"; mediaId: string; enlace: string | null }
  | { paso: "error"; mensaje: string };

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

export function PublicarHoyPanel({
  filas,
  horaTasas,
  conDegradacion,
}: {
  filas: { key: string; label: string; texto: string }[];
  horaTasas: string;
  /** Si algún proveedor falló o cayó a un respaldo en esta lectura. */
  conDegradacion: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });
  const publicando = estado.paso === "publicando";

  async function publicar() {
    if (
      !window.confirm(
        "Esto publica un carrusel nuevo en la cuenta real de Instagram, además del que ya salió hoy con el cron. No se puede deshacer. ¿Publicar ahora?",
      )
    ) {
      return;
    }

    setEstado({ paso: "publicando" });
    try {
      const response = await fetch("/api/admin/publish-hoy", { method: "POST" });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const body = await response.json();
      setEstado({ paso: "publicado", mediaId: body.mediaId, enlace: body.enlace });
    } catch (error) {
      setEstado({ paso: "error", mensaje: error instanceof Error ? error.message : "Fallo de red" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Tasas ahora mismo</h2>
          <span className="text-xs text-muted tabular">{horaTasas}</span>
        </div>
        <ul className="flex flex-col gap-1">
          {filas.map((fila) => (
            <li key={fila.key} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted">{fila.label}</span>
              <span className="tabular font-medium">{fila.texto}</span>
            </li>
          ))}
        </ul>
        {conDegradacion && (
          <p className="text-xs leading-relaxed text-warning">
            Al menos una fuente falló o cayó a un respaldo en esta lectura. Revisá los valores de arriba antes de
            publicar — el carrusel saldría con lo que se ve acá.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted">
          Publica el mismo carrusel de dos diapositivas que el cron (bolívares y pesos), con estas tasas y la hora de
          ahora. No lleva &quot;de la mañana&quot; ni &quot;de la tarde&quot; en el subtítulo, y no se archiva en el
          histórico semanal — es un disparo fuera de horario, no un reemplazo del de las 9:00 am o las 6:00 pm.{" "}
          <code>/hoy</code> queda apuntando a este post nuevo.
        </p>
        <button
          type="button"
          onClick={publicar}
          disabled={publicando}
          className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95 disabled:opacity-60"
        >
          {publicando ? "Publicando…" : "Publicar ahora"}
        </button>

        {estado.paso === "publicado" && (
          <p className="text-xs text-accent">
            Publicado. Media ID: {estado.mediaId}
            {estado.enlace && (
              <>
                {" · "}
                <a href={estado.enlace} target="_blank" rel="noreferrer" className="underline">
                  Ver el post
                </a>
              </>
            )}
          </p>
        )}
        {estado.paso === "error" && <p className="text-xs text-warning">{estado.mensaje}</p>}
      </section>
    </div>
  );
}
