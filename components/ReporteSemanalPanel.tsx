"use client";

import { useState } from "react";
import { ImagenConCarga } from "@/components/admin/ImagenConCarga";
import { Spinner } from "@/components/admin/Spinner";
import { BotonRedactarIa } from "@/components/BotonRedactarIa";
import { conAnalisisSemanal } from "@/lib/caption";

/**
 * Panel del reporte semanal: se mira y se publica.
 *
 * Las cifras no se editan a mano —salen del snapshot y del histórico— así que
 * el único campo es el análisis: un párrafo de contexto, opcional, que se puede
 * escribir o pedirle a la IA. Va aparte de las cifras a propósito; el caption
 * que se publica lo compone el servidor con las tasas del momento, y de aquí
 * solo viaja esa prosa.
 */

type Estado =
  | { paso: "inicial" }
  | { paso: "publicando" }
  | { paso: "publicado"; mediaId: string }
  | { paso: "error"; mensaje: string };

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

export function ReporteSemanalPanel({
  rangoTexto,
  sinComparacion,
  caption,
  iaDisponible,
}: {
  rangoTexto: string;
  sinComparacion: boolean;
  caption: string;
  /** Si hay clave de OpenRouter. Sin ella el análisis se escribe a mano. */
  iaDisponible: boolean;
}) {
  /**
   * Cambia la URL de las dos imágenes para forzar que el navegador vuelva a
   * pedirlas. Es el mismo truco que el `?actualizar=` de la portada y por el
   * mismo motivo: sin un parámetro que cambie, sirve su propia copia y el botón
   * no haría nada.
   *
   * Arranca vacío y **no** con `Date.now()`: sembrarlo con la hora daría un
   * valor distinto en el servidor y en el navegador, y eso rompe la hidratación
   * (verificado, React avisaba del `src` desajustado). En el primer render no
   * hay nada que refrescar de todas formas.
   */
  const [marca, setMarca] = useState("");
  const [analisis, setAnalisis] = useState("");
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  const publicando = estado.paso === "publicando";
  /**
   * El caption tal como saldría. Se compone con la misma función que usa el
   * servidor al publicar, así que lo que se lee aquí y lo que sale son lo
   * mismo, con el párrafo en el mismo sitio.
   */
  const conAnalisis = conAnalisisSemanal(caption, analisis);
  const base = "/api/og/instagram-semanal";
  const refresco = marca ? `&t=${marca}` : "";
  const cuadrada = `${base}?proporcion=1:1${refresco}`;
  const vertical = `${base}?proporcion=9:16${refresco}`;

  async function publicar() {
    setEstado({ paso: "publicando" });
    try {
      const response = await fetch("/api/admin/publish-semanal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Solo el análisis. Las cifras las recompone el servidor con las tasas
        // vigentes, que es lo que impide publicar un número viejo de una
        // pestaña que lleva horas abierta.
        body: JSON.stringify({ analisis: analisis.trim() || undefined }),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const body = await response.json();
      setEstado({ paso: "publicado", mediaId: body.mediaId });
    } catch (error) {
      setEstado({ paso: "error", mensaje: error instanceof Error ? error.message : "Fallo de red" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Semana</h2>
          <button
            type="button"
            onClick={() => setMarca(String(Date.now()))}
            className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
          >
            Actualizar vista previa
          </button>
        </div>
        <p className="text-sm font-medium">{rangoTexto}</p>

        {sinComparacion && (
          <p className="text-xs leading-relaxed text-warning">
            Todavía no hay una semana completa de histórico, así que el reporte sale sin variaciones. Los valores
            actuales sí son correctos.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Feed (1:1)</h2>
        <ImagenConCarga
          src={cuadrada}
          alt="Vista previa del reporte semanal para el feed"
          className="h-auto w-full rounded-2xl border border-border-soft"
        />
        <button
          type="button"
          onClick={publicar}
          disabled={publicando}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95 disabled:opacity-60"
        >
          {publicando && <Spinner className="size-4" />}
          {publicando ? "Publicando…" : "Publicar en el feed"}
        </button>

        {estado.paso === "publicado" && (
          <p className="text-xs text-accent">Publicado. Media ID: {estado.mediaId}</p>
        )}
        {estado.paso === "error" && <p className="text-xs text-warning">{estado.mensaje}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Story (9:16)</h2>
        <ImagenConCarga
          src={vertical}
          alt="Vista previa del reporte semanal para Story"
          className="mx-auto h-auto w-1/2 rounded-2xl border border-border-soft"
          aspecto="9:16"
        />
        <p className="text-xs leading-relaxed text-muted">
          La Story se sube a mano: publicada por la API no admite sticker de enlace, que es lo que la hace útil.
        </p>
        <a
          href={`${base}?proporcion=9:16&descargar=1`}
          className="rounded-2xl border border-border-soft px-4 py-3 text-center text-sm font-semibold transition active:scale-95"
        >
          Descargar 9:16
        </a>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="analisis" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Análisis (opcional)
        </label>
        <textarea
          id="analisis"
          value={analisis}
          onChange={(e) => setAnalisis(e.target.value)}
          rows={4}
          placeholder="Dos o tres frases de contexto. Se publica debajo de las cifras."
          className="whitespace-pre-wrap rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm text-foreground outline-none"
        />
        {iaDisponible && (
          <BotonRedactarIa
            etiqueta="Redactar análisis con IA"
            cuerpo={() => ({ tipo: "semanal" })}
            onTexto={setAnalisis}
            deshabilitado={publicando}
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Caption</h2>
        {/* `whitespace-pre-wrap` sobre un `<p>` y no un `<pre>`: aquel heredaría
            la mono del navegador, y el proyecto usa una sola familia. */}
        <p className="whitespace-pre-wrap rounded-2xl border border-border-soft bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
          {conAnalisis}
        </p>
      </section>
    </div>
  );
}
