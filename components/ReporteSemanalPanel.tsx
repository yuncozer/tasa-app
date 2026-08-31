"use client";

import { useState } from "react";
import { ImagenConCarga } from "@/components/admin/ImagenConCarga";
import { Spinner } from "@/components/admin/Spinner";
import { BotonRedactarIa } from "@/components/BotonRedactarIa";
import { conAnalisisSemanal } from "@/lib/caption";

/**
 * Panel del reporte semanal: se mira y se publica, al feed o como Historia.
 *
 * Las cifras no se editan a mano —salen del snapshot y del histórico—, pero el
 * texto sí: el análisis es un párrafo de contexto opcional que se escribe o se
 * le pide a la IA, y el caption entero se puede reescribir antes de publicar.
 * Mientras no se toque manda el servidor, que lo recompone con las tasas del
 * momento; en cuanto se edita viaja tal cual como `captionOverride`, mismo
 * criterio que `/admin/noticia`.
 */

type Destino = "feed" | "historia";

/**
 * El estado es uno por destino y no uno solo: el feed y la Historia se publican
 * por separado —a veces solo uno de los dos— y un estado compartido dejaría el
 * "Publicado" del post colgando debajo del botón de la Historia. Mismo reparto
 * que `AlertaBrechaPanel`.
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
  /**
   * El caption reescrito a mano, o `null` mientras se use el propuesto.
   *
   * Se distingue el `null` de la cadena vacía a propósito: son dos cosas
   * distintas —"todavía no lo he tocado" y "lo he borrado"—, y solo la primera
   * debe seguir recomponiéndose sola cuando cambia el análisis. Sin esa
   * distinción, escribir el análisis después de editar el caption pisaría lo
   * tecleado sin avisar.
   */
  const [captionEditado, setCaptionEditado] = useState<string | null>(null);
  const [feed, setFeed] = useState<Estado>({ paso: "inicial" });
  const [historia, setHistoria] = useState<Estado>({ paso: "inicial" });

  // Mientras uno de los dos está saliendo se bloquean ambos, igual que en la
  // alerta de brecha: los dos leen las tasas del momento en el servidor, y
  // dispararlos a la vez le pide a Meta dos descargas de imágenes que se
  // renderizan al vuelo sin ninguna necesidad.
  const publicando = feed.paso === "publicando" || historia.paso === "publicando";
  /**
   * El caption tal como saldría. Se compone con la misma función que usa el
   * servidor al publicar, así que lo que se lee aquí y lo que sale son lo
   * mismo, con el párrafo en el mismo sitio.
   */
  const propuesto = conAnalisisSemanal(caption, analisis);
  const conAnalisis = captionEditado ?? propuesto;
  const base = "/api/og/instagram-semanal";
  const refresco = marca ? `&t=${marca}` : "";
  const cuadrada = `${base}?proporcion=1:1${refresco}`;
  const vertical = `${base}?proporcion=9:16${refresco}`;

  async function publicar(destino: Destino) {
    // Mismo resguardo que `/admin/hoy` y `/admin/parada`: esto sale a la
    // cuenta real y no se deshace, y en el teléfono el botón queda a un dedo
    // de distancia mientras se revisa la imagen. Feed e Historia se confirman
    // por separado, igual que se disparan por separado: el texto nombra cuál.
    if (
      !window.confirm(
        `Esto publica el reporte semanal ${destino === "historia" ? "como Historia" : "en el feed"} de la cuenta real de Instagram. No se puede deshacer. ¿Publicar ahora?`,
      )
    ) {
      return;
    }

    const setEstado = destino === "historia" ? setHistoria : setFeed;

    setEstado({ paso: "publicando" });
    try {
      const response = await fetch("/api/admin/publish-semanal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // El caption solo viaja si se reescribió; si no, lo recompone el
        // servidor con las tasas vigentes, que es lo que impide publicar un
        // número viejo de una pestaña que lleva horas abierta. La Historia no
        // lleva ninguno de los dos: Meta ignora el caption en `STORIES`.
        body: JSON.stringify({
          destino,
          analisis: analisis.trim() || undefined,
          captionOverride: captionEditado?.trim() || undefined,
        }),
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
          onClick={() => publicar("feed")}
          disabled={publicando}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95 disabled:opacity-60"
        >
          {feed.paso === "publicando" && <Spinner className="size-4" />}
          {feed.paso === "publicando" ? "Publicando…" : "Publicar en el feed"}
        </button>

        {feed.paso === "publicado" && <p className="text-xs text-accent">Publicado. Media ID: {feed.mediaId}</p>}
        {feed.paso === "error" && <p className="text-xs text-warning">{feed.mensaje}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Story (9:16)</h2>
        <ImagenConCarga
          src={vertical}
          alt="Vista previa del reporte semanal para Story"
          className="mx-auto h-auto w-1/2 rounded-2xl border border-border-soft"
          aspecto="9:16"
        />
        <button
          type="button"
          onClick={() => publicar("historia")}
          disabled={publicando}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95 disabled:opacity-60"
        >
          {historia.paso === "publicando" && <Spinner className="size-4" />}
          {historia.paso === "publicando" ? "Publicando…" : "Publicar como Historia"}
        </button>

        {historia.paso === "publicado" && (
          <p className="text-xs text-accent">Historia publicada. Media ID: {historia.mediaId}</p>
        )}
        {historia.paso === "error" && <p className="text-xs text-warning">{historia.mensaje}</p>}

        {/* La descarga se queda: publicada por la API, la Historia no admite
            sticker de enlace, así que subirla a mano sigue siendo la vía para
            cuando sí se le quiera poner uno. */}
        <a
          href={`${base}?proporcion=9:16&descargar=1`}
          className="rounded-2xl border border-border-soft px-4 py-3 text-center text-sm font-semibold transition active:scale-95"
        >
          Descargar 9:16
        </a>
        <p className="text-xs leading-relaxed text-muted">
          Publicada desde aquí, la Historia sale sin sticker de enlace: la Graph API no lo admite. Si lo quieres,
          descárgala y súbela a mano.
        </p>
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
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="caption" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Caption
          </label>
          {captionEditado !== null && (
            <button
              type="button"
              onClick={() => setCaptionEditado(null)}
              className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
            >
              Restaurar propuesto
            </button>
          )}
        </div>
        <textarea
          id="caption"
          value={conAnalisis}
          onChange={(e) => setCaptionEditado(e.target.value)}
          rows={12}
          className="whitespace-pre-wrap rounded-2xl border border-border-soft bg-surface px-4 py-3 text-xs leading-relaxed text-foreground outline-none"
        />
        {captionEditado === null ? (
          <p className="text-xs leading-relaxed text-muted">
            Se recompone solo con las tasas del momento al publicar. Si lo editas, se publica tal cual lo dejes.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-warning">
            Caption escrito a mano: sale tal cual, con las cifras que tenga ahora. Ya no se recompone al publicar ni
            recoge lo que escribas en el análisis.
          </p>
        )}
      </section>
    </div>
  );
}
