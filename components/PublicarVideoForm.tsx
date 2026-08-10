"use client";

import { useState } from "react";
import type { PublicacionPayload } from "@/lib/publish-news";
import { BarraProgreso } from "@/components/BarraProgreso";
import type { Cintillo } from "@/components/ControlCintillo";
import { ControlCintillo } from "@/components/ControlCintillo";
import { ProgramarPublicacion } from "@/components/ProgramarPublicacion";
import { subirMediaConProgreso, type FaseSubida } from "@/lib/subida";

type Estado =
  | { paso: "inicial" }
  | { paso: "subiendo"; fase: FaseSubida }
  | { paso: "preview"; videoUrl: string; descargaUrl: string; videoPublicId: string }
  | { paso: "confirmar"; videoUrl: string; descargaUrl: string; videoPublicId: string }
  | { paso: "publicando"; videoUrl: string; descargaUrl: string; videoPublicId: string }
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
export function PublicarVideoForm({ onProgramada }: { onProgramada: () => void }) {
  const [caption, setCaption] = useState("");
  const [conFuente, setConFuente] = useState(false);
  const [fuente, setFuente] = useState("");
  /**
   * El crédito que de verdad está horneado en la URL que se está mirando. La
   * marca la compone Cloudinary al pedir la URL, así que editar el campo no
   * cambia el video en pantalla: hay que volver a pedirla. Guardarlo aparte es
   * lo que permite avisar de que lo que se ve ya no es lo que se publicaría.
   */
  const [fuenteAplicada, setFuenteAplicada] = useState("");
  const [cintillo, setCintillo] = useState<Cintillo | undefined>();
  /** El cintillo horneado en la URL que se está mirando, para detectar cambios. */
  const [cintilloAplicado, setCintilloAplicado] = useState<Cintillo | undefined>();
  const [refrescando, setRefrescando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  const subiendo = estado.paso === "subiendo";
  const publicando = estado.paso === "publicando";
  /** Sin la casilla activada el video va sin franja, aunque quede texto escrito. */
  const fuenteDeseada = conFuente ? fuente.trim() : "";

  async function pedirPreview(videoPublicId: string): Promise<void> {
    const preview = await fetch("/api/admin/preview-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoPublicId,
        fuente: fuenteDeseada,
        titulo: cintillo?.titulo,
        segundos: cintillo?.segundos,
      }),
    });
    if (!preview.ok) {
      setEstado({ paso: "error", mensaje: await leerError(preview) });
      return;
    }
    const { videoUrl, descargaUrl } = (await preview.json()) as { videoUrl: string; descargaUrl: string };
    setFuenteAplicada(fuenteDeseada);
    setCintilloAplicado(cintillo);
    setEstado({ paso: "preview", videoUrl, descargaUrl, videoPublicId });
  }

  async function subirVideo(archivo: File) {
    setEstado({ paso: "subiendo", fase: { tipo: "enviando", porcentaje: 0 } });
    try {
      const publicId = await subirMediaConProgreso(archivo, "video", (fase) =>
        setEstado({ paso: "subiendo", fase }),
      );

      // La marca se aplica al pedir esta vista previa (`urlVideoConMarca`), así
      // que sigue dentro de la fase de proceso: la barra no se retira hasta que
      // haya un video que mirar.
      await pedirPreview(publicId);
    } catch (error) {
      // La subida rechaza con el mensaje que devolvió el servidor (p. ej. el
      // tope de 100 MB), que dice bastante más que un fallo de conexión.
      const mensaje = error instanceof Error ? error.message : "No se pudo conectar con el servidor";
      setEstado({ paso: "error", mensaje });
    }
  }

  async function actualizarPreview(videoPublicId: string) {
    setRefrescando(true);
    try {
      await pedirPreview(videoPublicId);
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo generar la vista previa del video" });
    } finally {
      setRefrescando(false);
    }
  }

  async function publicar(videoPublicId: string) {
    if (!("videoUrl" in estado)) return;
    setEstado({ paso: "publicando", videoUrl: estado.videoUrl, descargaUrl: estado.descargaUrl, videoPublicId });
    try {
      const response = await fetch("/api/admin/publish-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        videoPublicId,
        caption,
        fuente: fuenteAplicada,
        titulo: cintilloAplicado?.titulo,
        segundos: cintilloAplicado?.segundos,
      }),
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
  /** Lo que se ve dejó de ser lo que se publicaría: hay que regenerar la URL. */
  const desactualizado =
    conVideo !== null &&
    (fuenteDeseada !== fuenteAplicada ||
      JSON.stringify(cintillo ?? null) !== JSON.stringify(cintilloAplicado ?? null));

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border-soft bg-surface px-4 py-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Video propio</h2>
        <p className="text-xs text-muted">
          Se le montan los sellos de La Tasa y se publica como Reel. El crédito de la fuente es
          opcional.
        </p>
      </div>

      {/* El `disabled` real vive en el `<input>` oculto, así que la opacidad de
          deshabilitado hay que ponerla a mano en la etiqueta. */}
      <label
        className={`flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border-soft bg-surface-strong px-4 py-4 text-sm font-semibold text-muted transition active:scale-95 ${
          subiendo || publicando ? "opacity-50" : ""
        }`}
      >
        {conVideo ? "Video cargado · cambiar" : "Elegir video"}
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

      {estado.paso === "subiendo" && (
        <BarraProgreso
          fase={estado.fase}
          etiqueta={
            estado.fase.tipo === "enviando" ? "Enviando el video" : "Procesando el video y aplicando la marca…"
          }
        />
      )}

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

          {/* Enlace y no botón con `fetch`: la URL ya viene con `fl_attachment`
              de Cloudinary, que responde con `Content-Disposition: attachment`.
              El atributo `download` de HTML no bastaría, porque se ignora entre
              orígenes distintos y el video lo sirve Cloudinary. */}
          <a
            href={conVideo.descargaUrl}
            download
            className="rounded-xl border border-border-soft px-4 py-3 text-center text-sm font-semibold text-muted transition active:scale-95"
          >
            Descargar el video
          </a>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-pressed={conFuente}
              onClick={() => setConFuente(!conFuente)}
              disabled={publicando}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${
                conFuente
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-soft bg-surface text-muted"
              }`}
            >
              Acreditar la fuente en el video
            </button>

            {conFuente && (
              <input
                id="fuente-video"
                value={fuente}
                onChange={(e) => setFuente(e.target.value)}
                placeholder="lapatilla.com"
                className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base text-foreground outline-none"
              />
            )}

            <ControlCintillo
              idPrefijo="cintillo-reel"
              valor={cintillo}
              onCambiar={setCintillo}
              deshabilitado={publicando}
            />
          </div>

          {desactualizado && (
            <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3">
              <p className="text-sm text-warning">
                Cambiaste la fuente o el cintillo: el video de arriba ya no es el que se publicaría.
              </p>
              <button
                type="button"
                onClick={() => void actualizarPreview(conVideo.videoPublicId)}
                disabled={refrescando}
                className="rounded-xl border border-accent bg-accent/15 px-4 py-3 text-sm font-semibold text-accent transition active:scale-95 disabled:opacity-50"
              >
                {refrescando ? "Actualizando…" : "Actualizar vista previa"}
              </button>
            </div>
          )}

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
                  onClick={() => setEstado({
                      paso: "preview",
                      videoUrl: conVideo.videoUrl,
                      descargaUrl: conVideo.descargaUrl,
                      videoPublicId: conVideo.videoPublicId,
                    })}
                  className="flex-1 rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm font-semibold text-muted transition active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEstado({
                  paso: "confirmar",
                  videoUrl: conVideo.videoUrl,
                  descargaUrl: conVideo.descargaUrl,
                  videoPublicId: conVideo.videoPublicId,
                })}
              disabled={!caption.trim() || publicando || desactualizado || refrescando}
              className="rounded-xl border border-warning bg-warning/15 px-4 py-3 text-base font-semibold text-warning transition active:scale-95 disabled:opacity-50"
            >
              {publicando ? "Publicando…" : "Publicar Reel"}
            </button>
          )}

          <ProgramarPublicacion
            payload={
              caption.trim()
                ? ({
                    tipo: "reel",
                    videoPublicId: conVideo.videoPublicId,
                    caption,
                    fuente: fuenteAplicada || undefined,
                    titulo: cintilloAplicado?.titulo || undefined,
                    segundos: cintilloAplicado?.segundos,
                  } satisfies PublicacionPayload)
                : null
            }
            deshabilitado={publicando || subiendo || desactualizado || refrescando}
            onProgramada={onProgramada}
          />
        </div>
      )}
    </div>
  );
}
