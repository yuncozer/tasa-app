"use client";

import { useState } from "react";

/**
 * Panel de `/admin/parada`: revisa el borrador que detectó el cron y lo
 * publica. El caption se muestra editable, como `captionOverride` en
 * `/admin/noticia` — el crédito a @lanacionweb y @ponchogocho lo arma la
 * plantilla, pero si algún día firma otro reportero hay que poder
 * corregirlo antes de publicar.
 */

interface Borrador {
  url: string;
  titulo: string;
  caption: string;
  detectadoEn: string;
}

type Estado =
  | { paso: "inicial" }
  | { paso: "publicando" }
  | { paso: "publicado"; mediaId: string }
  | { paso: "error"; mensaje: string };

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

export function ParadaPanel({
  borrador,
  imagenUrl,
  errorPreview,
}: {
  borrador: Borrador | null;
  imagenUrl: string | null;
  errorPreview: string | null;
}) {
  const [caption, setCaption] = useState(borrador?.caption ?? "");
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });
  const publicando = estado.paso === "publicando";

  if (!borrador) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-4">
        <p className="text-sm text-muted">
          Todavía no hay ningún borrador pendiente. Un cron revisa la categoría Frontera de lanacionweb.com cada
          pocos minutos y arma el post en cuanto sale el artículo de hoy — vuelve a mirar más tarde.
        </p>
      </section>
    );
  }

  async function publicar() {
    if (!window.confirm("Esto publica el post en la cuenta real de Instagram. No se puede deshacer. ¿Publicar ahora?")) {
      return;
    }

    setEstado({ paso: "publicando" });
    try {
      const response = await fetch("/api/admin/publish-parada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
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

  const publicado = estado.paso === "publicado";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-3">
        <p className="text-sm font-medium">{borrador.titulo}</p>
        <a
          href={borrador.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted underline underline-offset-2"
        >
          Ver artículo original en lanacionweb.com
        </a>
      </section>

      {imagenUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Se genera al vuelo; next/image obligaría a declarar el host.
        <img
          src={imagenUrl}
          alt={`Vista previa del post: ${borrador.titulo}`}
          className="h-auto w-full rounded-2xl border border-border-soft"
        />
      )}
      {errorPreview && (
        <p className="text-xs leading-relaxed text-warning">
          No se pudo generar la vista previa ({errorPreview}). Publicar volvería a intentar scrapear el artículo, así
          que puede fallar igual — revisá el enlace de arriba antes de publicar.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="caption-parada" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Caption
        </label>
        <textarea
          id="caption-parada"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={10}
          className="whitespace-pre-wrap rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm text-foreground outline-none"
        />
      </section>

      <button
        type="button"
        onClick={publicar}
        disabled={publicando || publicado}
        className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95 disabled:opacity-60"
      >
        {publicando ? "Publicando…" : publicado ? "Publicado" : "Publicar ahora"}
      </button>

      {estado.paso === "publicado" && <p className="text-xs text-accent">Publicado. Media ID: {estado.mediaId}</p>}
      {estado.paso === "error" && <p className="text-xs text-warning">{estado.mensaje}</p>}
    </div>
  );
}
