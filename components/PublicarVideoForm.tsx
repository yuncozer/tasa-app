"use client";

import { useState } from "react";

type Estado =
  | { paso: "inicial" }
  | { paso: "subiendo" }
  | { paso: "preview"; videoUrl: string; videoPublicId: string }
  | { paso: "confirmar"; videoUrl: string; videoPublicId: string }
  | { paso: "publicando"; videoUrl: string; videoPublicId: string }
  | { paso: "publicado"; mediaId: string }
  | { paso: "error"; mensaje: string };

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

/**
 * Video propio con la franja de marca de La Tasa superpuesta (Cloudinary),
 * publicado como Reel — independiente del post de imagen: Instagram no
 * permite combinarlos en un mismo post fuera de un carrusel, así que aquí se
 * publican por separado, cada uno con su confirmación.
 */
export function PublicarVideoForm() {
  const [caption, setCaption] = useState("");
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  const subiendo = estado.paso === "subiendo";
  const publicando = estado.paso === "publicando";

  async function subirVideo(archivo: File) {
    setEstado({ paso: "subiendo" });
    try {
      const form = new FormData();
      form.set("archivo", archivo);
      form.set("tipo", "video");
      const subida = await fetch("/api/admin/subir-media", { method: "POST", body: form });
      if (!subida.ok) {
        setEstado({ paso: "error", mensaje: await leerError(subida) });
        return;
      }
      const { publicId } = (await subida.json()) as { publicId: string };

      const preview = await fetch("/api/admin/preview-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoPublicId: publicId }),
      });
      if (!preview.ok) {
        setEstado({ paso: "error", mensaje: await leerError(preview) });
        return;
      }
      const { videoUrl } = (await preview.json()) as { videoUrl: string };
      setEstado({ paso: "preview", videoUrl, videoPublicId: publicId });
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo conectar con el servidor" });
    }
  }

  async function publicar(videoPublicId: string) {
    if (!("videoUrl" in estado)) return;
    setEstado({ paso: "publicando", videoUrl: estado.videoUrl, videoPublicId });
    try {
      const response = await fetch("/api/admin/publish-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoPublicId, caption }),
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

  const conVideo = "videoUrl" in estado ? estado : null;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border-soft bg-surface px-4 py-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Video propio</h2>
        <p className="text-xs text-muted">Se le monta la franja de marca de La Tasa y se publica como Reel.</p>
      </div>

      <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border-soft bg-surface-strong px-4 py-4 text-sm font-semibold text-muted transition active:scale-95">
        {subiendo ? "Subiendo y aplicando la marca…" : conVideo ? "Video cargado · cambiar" : "Elegir video"}
        <input
          type="file"
          accept="video/*"
          className="hidden"
          disabled={subiendo || publicando}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void subirVideo(archivo);
            e.target.value = "";
          }}
        />
      </label>

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

      {conVideo && (
        <div className="flex flex-col gap-4">
          <video src={conVideo.videoUrl} controls className="w-full rounded-2xl border border-border-soft" />

          <div className="flex flex-col gap-1">
            <label htmlFor="caption-video" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Caption
            </label>
            <textarea
              id="caption-video"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              placeholder="Escribe el caption del Reel…"
              className="whitespace-pre-wrap rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm text-foreground outline-none"
            />
          </div>

          {estado.paso === "confirmar" ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3">
              <p className="text-sm text-warning">¿Publicar este Reel ahora en la cuenta real de Instagram?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => publicar(conVideo.videoPublicId)}
                  className="flex-1 rounded-xl border border-warning bg-warning/15 px-4 py-3 text-sm font-semibold text-warning transition active:scale-95"
                >
                  Sí, publicar ahora
                </button>
                <button
                  type="button"
                  onClick={() => setEstado({ paso: "preview", videoUrl: conVideo.videoUrl, videoPublicId: conVideo.videoPublicId })}
                  className="flex-1 rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm font-semibold text-muted transition active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEstado({ paso: "confirmar", videoUrl: conVideo.videoUrl, videoPublicId: conVideo.videoPublicId })}
              disabled={!caption.trim() || publicando}
              className="rounded-xl border border-warning bg-warning/15 px-4 py-3 text-base font-semibold text-warning transition active:scale-95 disabled:opacity-50"
            >
              {publicando ? "Publicando…" : "Publicar Reel"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
