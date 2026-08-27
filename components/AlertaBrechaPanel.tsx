"use client";

import { useState } from "react";
import { ImagenConCarga } from "@/components/admin/ImagenConCarga";
import { Spinner } from "@/components/admin/Spinner";

/**
 * Panel de la alerta de brecha: se mira y se publica, como el reporte semanal.
 *
 * No tiene campos. Las cifras salen del snapshot y del histórico, y el titular
 * lo decide la dirección del movimiento (`lib/alerta-brecha.ts`): dejarlo
 * editable permitiría publicar un "se abrió la brecha" sobre unas cifras que
 * dicen lo contrario, que es justo el daño que esta pieza puede causar.
 *
 * Lo único que se decide aquí es **cuándo** se publica, que es la razón de que
 * no haya cron: sale cuando el admin ve que el movimiento merece contarse.
 */

type Destino = "feed" | "historia";

/**
 * El estado es uno por destino y no uno solo: el feed y la Historia se publican
 * por separado —a veces solo uno de los dos— y un estado compartido dejaría el
 * "Publicado" del post colgando debajo del botón de la Historia.
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

export function AlertaBrechaPanel({
  titular,
  brechaTexto,
  brechaAntesTexto,
  variacionTexto,
  sinComparacion,
  publicable,
  caption,
}: {
  titular: string;
  brechaTexto: string;
  brechaAntesTexto: string;
  /** La variación ya con su flecha, o `null` si no hay con qué comparar. */
  variacionTexto: string | null;
  sinComparacion: boolean;
  /** Sin brecha no hay pieza: el botón se deshabilita en vez de publicar un hueco. */
  publicable: boolean;
  caption: string;
}) {
  /**
   * Cambia la URL de las dos imágenes para forzar que el navegador vuelva a
   * pedirlas, mismo truco que el `?actualizar=` de la portada. Arranca vacío y
   * no con `Date.now()`: sembrarlo con la hora daría valores distintos en el
   * servidor y en el navegador, y eso rompe la hidratación.
   */
  const [marca, setMarca] = useState("");
  const [feed, setFeed] = useState<Estado>({ paso: "inicial" });
  const [historia, setHistoria] = useState<Estado>({ paso: "inicial" });

  // Mientras uno de los dos está saliendo se bloquean ambos: los dos leen las
  // tasas del momento en el servidor, y dispararlos a la vez es pedirle a Meta
  // dos descargas de imágenes que se renderizan al vuelo sin ninguna necesidad.
  const publicando = feed.paso === "publicando" || historia.paso === "publicando";
  const base = "/api/og/instagram-brecha";
  const refresco = marca ? `&t=${marca}` : "";
  const cuadrada = `${base}?proporcion=1:1${refresco}`;
  const vertical = `${base}?proporcion=9:16${refresco}`;

  async function publicar(destino: Destino) {
    const setEstado = destino === "historia" ? setHistoria : setFeed;

    setEstado({ paso: "publicando" });
    try {
      const response = await fetch("/api/admin/publish-brecha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Solo el destino. Las cifras y el caption los recompone el servidor con
        // las tasas vigentes, que es lo que impide publicar un número viejo de
        // una pestaña que lleva horas abierta.
        body: JSON.stringify({ destino }),
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Brecha</h2>
          <button
            type="button"
            onClick={() => setMarca(String(Date.now()))}
            className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
          >
            Actualizar vista previa
          </button>
        </div>
        <p className="text-sm font-medium">{titular}</p>
        <p className="tabular text-sm text-muted">
          Hoy {brechaTexto}
          {!sinComparacion && ` · hace una semana ${brechaAntesTexto}`}
          {variacionTexto && ` · ${variacionTexto}`}
        </p>

        {sinComparacion && (
          <p className="text-xs leading-relaxed text-warning">
            No hay dato de hace una semana en el histórico, así que la alerta sale solo con la brecha de hoy.
          </p>
        )}
        {!publicable && (
          <p className="text-xs leading-relaxed text-warning">
            Falta una de las dos tasas (BCV o Binance venta), así que no hay brecha que publicar. Vuelve a intentarlo
            cuando la fuente responda.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Feed (1:1)</h2>
        <ImagenConCarga
          src={cuadrada}
          alt="Vista previa de la alerta de brecha para el feed"
          className="h-auto w-full rounded-2xl border border-border-soft"
        />
        <button
          type="button"
          onClick={() => publicar("feed")}
          disabled={publicando || !publicable}
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
          alt="Vista previa de la alerta de brecha para Story"
          className="mx-auto h-auto w-1/2 rounded-2xl border border-border-soft"
          aspecto="9:16"
        />
        <button
          type="button"
          onClick={() => publicar("historia")}
          disabled={publicando || !publicable}
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Caption</h2>
        {/* `whitespace-pre-wrap` sobre un `<p>` y no un `<pre>`: aquel heredaría
            la mono del navegador, y el proyecto usa una sola familia. */}
        <p className="whitespace-pre-wrap rounded-2xl border border-border-soft bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
          {caption}
        </p>
      </section>
    </div>
  );
}
