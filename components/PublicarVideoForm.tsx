"use client";

import { useEffect, useState } from "react";
import type { PublicacionPayload } from "@/lib/publish-news";
import { Spinner } from "@/components/admin/Spinner";
import { BarraProgreso } from "@/components/BarraProgreso";
import type { Cintillo } from "@/components/ControlCintillo";
import { ControlCintillo } from "@/components/ControlCintillo";
import { ProgramarPublicacion } from "@/components/ProgramarPublicacion";
import { SelectorMedia, type ItemMedia } from "@/components/SelectorMedia";
import { subirMediaConProgreso, type FaseSubida } from "@/lib/subida";

type Estado =
  | { paso: "inicial" }
  | { paso: "subiendo"; fase: FaseSubida }
  | { paso: "preview"; videoUrl: string; descargaUrl: string; conCintillo: boolean; videoPublicId: string }
  | { paso: "confirmar"; videoUrl: string; descargaUrl: string; conCintillo: boolean; videoPublicId: string }
  | { paso: "publicando"; videoUrl: string; descargaUrl: string; conCintillo: boolean; videoPublicId: string }
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
 *
 * `edicion`, si viene, prellena el formulario con el `reel` guardado de una
 * programada `pendiente`: el padre remonta el componente con una `key`
 * distinta por fila, así que solo el video necesita pedirse de nuevo al
 * montar (para tener una URL con la que mostrarlo), el resto de los campos se
 * siembra directo en el estado inicial.
 */
export function PublicarVideoForm({
  onProgramada,
  edicion,
  onCancelarEdicion,
}: {
  onProgramada: () => void;
  edicion?: { id: string; payload: Extract<PublicacionPayload, { tipo: "reel" }>; publicarEn: string };
  onCancelarEdicion?: () => void;
}) {
  const [caption, setCaption] = useState(edicion?.payload.caption ?? "");
  const [conFuente, setConFuente] = useState(Boolean(edicion?.payload.fuente));
  const [fuente, setFuente] = useState(edicion?.payload.fuente ?? "");
  /**
   * El crédito que de verdad está horneado en la URL que se está mirando. La
   * marca la compone Cloudinary al pedir la URL, así que editar el campo no
   * cambia el video en pantalla: hay que volver a pedirla. Guardarlo aparte es
   * lo que permite avisar de que lo que se ve ya no es lo que se publicaría.
   */
  const cintilloInicial = edicion?.payload.titulo
    ? { titulo: edicion.payload.titulo, inicio: edicion.payload.inicio, fin: edicion.payload.fin }
    : undefined;
  const [fuenteAplicada, setFuenteAplicada] = useState("");
  const [cintillo, setCintillo] = useState<Cintillo | undefined>(cintilloInicial);
  /** El cintillo horneado en la URL que se está mirando, para detectar cambios. */
  const [cintilloAplicado, setCintilloAplicado] = useState<Cintillo | undefined>();
  const [refrescando, setRefrescando] = useState(false);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  const subiendo = estado.paso === "subiendo";
  const publicando = estado.paso === "publicando";
  /** Sin la casilla activada el video va sin franja, aunque quede texto escrito. */
  const fuenteDeseada = conFuente ? fuente.trim() : "";

  /**
   * `overrides` existe solo para el arranque en modo edición: ahí hace falta
   * pedir la vista previa con los valores que trae `edicion`, no con el
   * estado —que en ese primer render todavía no se ha aplicado— así que se
   * pueden pasar explícitos en vez de leerlos siempre del cierre.
   */
  async function pedirPreview(
    videoPublicId: string,
    overrides?: { fuente?: string; cintillo?: Cintillo },
  ): Promise<void> {
    const fuenteUsada = overrides?.fuente ?? fuenteDeseada;
    const cintilloUsado = overrides ? overrides.cintillo : cintillo;
    const preview = await fetch("/api/admin/preview-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoPublicId,
        fuente: fuenteUsada,
        titulo: cintilloUsado?.titulo,
        inicio: cintilloUsado?.inicio,
        fin: cintilloUsado?.fin,
      }),
    });
    if (!preview.ok) {
      setEstado({ paso: "error", mensaje: await leerError(preview) });
      return;
    }
    const { videoUrl, descargaUrl, conCintillo } = (await preview.json()) as {
      videoUrl: string;
      descargaUrl: string;
      conCintillo: boolean;
    };
    setFuenteAplicada(fuenteUsada);
    setCintilloAplicado(cintilloUsado);
    setEstado({ paso: "preview", videoUrl, descargaUrl, conCintillo, videoPublicId });
  }

  useEffect(() => {
    if (!edicion) return;
    (async () => {
      try {
        await pedirPreview(edicion.payload.videoPublicId, {
          fuente: edicion.payload.fuente ?? "",
          cintillo: cintilloInicial,
        });
      } catch {
        setEstado({ paso: "error", mensaje: "No se pudo cargar la vista previa del video" });
      }
    })();
    // Se pide una sola vez al montar: el padre remonta este componente con
    // una `key` distinta por fila, así que no hace falta reaccionar a más.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirVideoDeBiblioteca(item: ItemMedia) {
    setSelectorAbierto(false);
    void pedirPreview(item.publicId).catch(() =>
      setEstado({ paso: "error", mensaje: "No se pudo generar la vista previa del video" }),
    );
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
    if (
      !window.confirm(
        "Esto publica el video en la cuenta real de Instagram. No se puede deshacer. ¿Publicar ahora?",
      )
    ) {
      return;
    }

    if (!("videoUrl" in estado)) return;
    setEstado({
      paso: "publicando",
      videoUrl: estado.videoUrl,
      descargaUrl: estado.descargaUrl,
      conCintillo: estado.conCintillo,
      videoPublicId,
    });
    try {
      const response = await fetch("/api/admin/publish-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        videoPublicId,
        caption,
        fuente: fuenteAplicada,
        titulo: cintilloAplicado?.titulo,
        inicio: cintilloAplicado?.inicio,
        fin: cintilloAplicado?.fin,
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

      {edicion && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
          <p className="text-sm text-accent">Editando una publicación en cola.</p>
          {onCancelarEdicion && (
            <button
              type="button"
              onClick={onCancelarEdicion}
              className="shrink-0 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium text-accent transition active:scale-95"
            >
              Cancelar edición
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {/* El `disabled` real vive en el `<input>` oculto, así que la opacidad de
            deshabilitado hay que ponerla a mano en la etiqueta. */}
        <label
          className={`flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border-soft bg-surface-strong px-4 py-4 text-sm font-semibold text-muted transition active:scale-95 ${
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
        <button
          type="button"
          onClick={() => setSelectorAbierto(true)}
          disabled={subiendo || publicando}
          className="rounded-xl border border-border-soft bg-surface px-4 py-4 text-sm font-semibold text-muted transition active:scale-95 disabled:opacity-50"
        >
          Elegir de la biblioteca
        </button>
      </div>

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

          {/* Qué marca lleva de verdad el video que se está viendo. Sin esto, una
              capa que no se aplique es invisible: Cloudinary sirve el clip sin
              ella y sin error, y se publicaría creyendo que la lleva. */}
          <p className={`text-xs ${conVideo.conCintillo ? "text-accent" : "text-muted"}`}>
            {conVideo.conCintillo ? "Cintillo aplicado" : "Sin cintillo: solo el sello de marca"}
          </p>

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
                className="flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent/15 px-4 py-3 text-sm font-semibold text-accent transition active:scale-95 disabled:opacity-50"
              >
                {refrescando && <Spinner className="size-4" />}
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

          {/* En modo edición no hay publicación inmediata: es una operación
              de cola, y "Publicar ahora" queda para la fila en la cola misma. */}
          {!edicion &&
            (estado.paso === "confirmar" ? (
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
                    onClick={() =>
                      setEstado({
                        paso: "preview",
                        videoUrl: conVideo.videoUrl,
                        descargaUrl: conVideo.descargaUrl,
                        conCintillo: conVideo.conCintillo,
                        videoPublicId: conVideo.videoPublicId,
                      })
                    }
                    className="flex-1 rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm font-semibold text-muted transition active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setEstado({
                    paso: "confirmar",
                    videoUrl: conVideo.videoUrl,
                    descargaUrl: conVideo.descargaUrl,
                    conCintillo: conVideo.conCintillo,
                    videoPublicId: conVideo.videoPublicId,
                  })
                }
                disabled={!caption.trim() || publicando || desactualizado || refrescando}
                className="flex items-center justify-center gap-2 rounded-xl border border-warning bg-warning/15 px-4 py-3 text-base font-semibold text-warning transition active:scale-95 disabled:opacity-50"
              >
                {publicando && <Spinner className="size-4" />}
                {publicando ? "Publicando…" : "Publicar Reel"}
              </button>
            ))}

          <ProgramarPublicacion
            payload={
              caption.trim()
                ? ({
                    tipo: "reel",
                    videoPublicId: conVideo.videoPublicId,
                    caption,
                    fuente: fuenteAplicada || undefined,
                    titulo: cintilloAplicado?.titulo || undefined,
                    inicio: cintilloAplicado?.inicio,
                    fin: cintilloAplicado?.fin,
                  } satisfies PublicacionPayload)
                : null
            }
            deshabilitado={publicando || subiendo || desactualizado || refrescando}
            onProgramada={onProgramada}
            edicion={edicion ? { id: edicion.id, publicarEnInicial: edicion.publicarEn } : undefined}
          />
        </div>
      )}

      {selectorAbierto && (
        <SelectorMedia tipo="video" onCerrar={() => setSelectorAbierto(false)} onElegir={elegirVideoDeBiblioteca} />
      )}
    </div>
  );
}
