"use client";

import { useState } from "react";

interface Preview {
  title: string;
  sourceHost: string;
  caption: string;
  imageUrl: string;
}

type Estado =
  | { paso: "inicial" }
  | { paso: "cargando-preview" }
  | { paso: "preview"; preview: Preview }
  | { paso: "confirmar"; preview: Preview }
  | { paso: "publicando"; preview: Preview }
  | { paso: "publicado"; mediaId: string }
  | { paso: "error"; mensaje: string };

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

/**
 * Formulario de `/admin/noticia`: pegar la URL del artículo, ver la vista
 * previa real (imagen + caption) y publicar solo tras un segundo paso de
 * confirmación — es una acción externa e irreversible.
 */
export function PublicarNoticiaForm() {
  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  const cargandoPreview = estado.paso === "cargando-preview";
  const publicando = estado.paso === "publicando";

  async function verVistaPrevia() {
    setEstado({ paso: "cargando-preview" });
    try {
      const response = await fetch("/api/admin/preview-noticia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const preview = (await response.json()) as Preview;
      setEstado({ paso: "preview", preview });
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo conectar con el servidor" });
    }
  }

  async function publicar(preview: Preview) {
    setEstado({ paso: "publicando", preview });
    try {
      const response = await fetch("/api/admin/publish-noticia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const data = (await response.json()) as { mediaId: string };
      setEstado({ paso: "publicado", mediaId: data.mediaId });
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo conectar con el servidor" });
    }
  }

  const preview = "preview" in estado ? estado.preview : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="url-articulo" className="text-sm font-semibold uppercase tracking-wide text-muted">
          URL del artículo
        </label>
        <input
          id="url-articulo"
          type="url"
          inputMode="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setEstado({ paso: "inicial" });
          }}
          className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base text-foreground outline-none"
        />
      </div>

      <button
        type="button"
        onClick={verVistaPrevia}
        disabled={!url || cargandoPreview || publicando}
        className="rounded-xl border border-accent bg-accent/15 px-4 py-3 text-base font-semibold text-accent transition active:scale-95 disabled:opacity-50"
      >
        {cargandoPreview ? "Cargando vista previa…" : "Vista previa"}
      </button>

      {estado.paso === "error" && (
        <p className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
          {estado.mensaje}
        </p>
      )}

      {estado.paso === "publicado" && (
        <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          Publicado. ID del post: {estado.mediaId}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border-soft bg-surface px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada dinámicamente, no un asset estático. */}
          <img src={preview.imageUrl} alt="" className="w-full rounded-2xl border border-border-soft" />

          <pre className="whitespace-pre-wrap break-words text-sm text-foreground">{preview.caption}</pre>

          <p className="text-xs text-muted">Fuente: {preview.sourceHost}</p>

          {estado.paso === "confirmar" ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3">
              <p className="text-sm text-warning">¿Publicar ahora en la cuenta real de Instagram?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => publicar(preview)}
                  className="flex-1 rounded-xl border border-warning bg-warning/15 px-4 py-3 text-sm font-semibold text-warning transition active:scale-95"
                >
                  Sí, publicar ahora
                </button>
                <button
                  type="button"
                  onClick={() => setEstado({ paso: "preview", preview })}
                  className="flex-1 rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm font-semibold text-muted transition active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEstado({ paso: "confirmar", preview })}
              disabled={publicando}
              className="rounded-xl border border-warning bg-warning/15 px-4 py-3 text-base font-semibold text-warning transition active:scale-95 disabled:opacity-50"
            >
              {publicando ? "Publicando…" : "Publicar"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
