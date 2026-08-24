"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/admin/Spinner";

/**
 * Botón de generar + vista previa del Reel de tasas.
 *
 * El render en la nube tarda cerca de un minuto y la petición que lo encola
 * vuelve enseguida, así que este componente **pregunta por el estado** cada
 * pocos segundos hasta que está listo. Es el mismo reparto en fases que usa la
 * cola de programadas, y por el mismo motivo: esperar el minuto entero dentro
 * de una función de Vercel no cabe.
 *
 * No hay barra con porcentaje porque no hay nada que medir: HeyGen no reporta
 * avance. Se queda indeterminada y dice en qué anda, igual que hace la subida a
 * Cloudinary cuando deja de poder medir — inventar un número sería peor que no
 * ponerlo.
 */

interface Props {
  /** Por qué no se puede generar aquí, si no se puede. Deshabilita el botón. */
  motivoNoDisponible: string | null;
  /** `true` si el render lo hará la nube; solo cambia el texto de ayuda. */
  enNube: boolean;
}

const CADENCIA_MS = 5000;
/** Un render ronda el minuto; a los cinco se da por perdido. */
const MAX_INTENTOS = 60;

type Video = { src: string; descarga: string };

export function GeneradorVideoTasas({ motivoNoDisponible, enNube }: Props) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const cancelado = useRef(false);

  // Si se sale de la pantalla a mitad, se deja de preguntar.
  useEffect(() => {
    cancelado.current = false;
    return () => {
      cancelado.current = true;
    };
  }, []);

  async function esperarNube(renderId: string) {
    for (let intento = 0; intento < MAX_INTENTOS; intento += 1) {
      await new Promise((r) => setTimeout(r, CADENCIA_MS));
      if (cancelado.current) return;

      const respuesta = await fetch(`/api/admin/video/estado?id=${encodeURIComponent(renderId)}`);
      const datos = (await respuesta.json()) as { estado?: string; error?: string };

      if (datos.estado === "listo") {
        const base = `/api/admin/video/archivo?id=${encodeURIComponent(renderId)}`;
        setVideo({ src: base, descarga: `${base}&descargar=1` });
        return;
      }
      if (datos.estado === "fallido" || datos.error) {
        throw new Error(datos.error ?? "El render falló");
      }
    }
    throw new Error("El render tardó demasiado. Míralo en HeyGen antes de reintentar.");
  }

  async function generar() {
    setGenerando(true);
    setError(null);
    setVideo(null);

    try {
      const respuesta = await fetch("/api/admin/video/generar", { method: "POST" });
      const datos = (await respuesta.json()) as {
        modo?: string;
        renderId?: string;
        marca?: number;
        error?: string;
      };

      if (!respuesta.ok) {
        // Se muestra el mensaje del servidor y no uno genérico: es lo que le
        // dice al admin si reintentar o si hay algo que arreglar.
        throw new Error(datos.error ?? "No se pudo generar el video");
      }

      if (datos.modo === "nube" && datos.renderId) {
        await esperarNube(datos.renderId);
      } else if (datos.modo === "local") {
        const base = `/api/admin/video/archivo?v=${datos.marca ?? Date.now()}`;
        setVideo({ src: base, descarga: `${base}&descargar=1` });
      } else {
        throw new Error("Respuesta inesperada del servidor");
      }
    } catch (e) {
      if (!cancelado.current) setError(e instanceof Error ? e.message : "No se pudo generar el video");
    } finally {
      if (!cancelado.current) setGenerando(false);
    }
  }

  if (motivoNoDisponible) {
    return (
      <p className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-warning">
        {motivoNoDisponible}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={generar}
        disabled={generando}
        className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95 disabled:opacity-60"
      >
        {generando && <Spinner className="size-4" />}
        {generando ? "Generando video…" : video ? "Generar de nuevo" : "Generar video"}
      </button>

      {generando ? (
        <div className="flex flex-col gap-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-strong">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
          </div>
          <p className="text-xs text-muted">
            {enNube
              ? "Renderizando en la nube. Tarda cerca de un minuto; puedes dejar la pantalla abierta."
              : "Renderizando 300 fotogramas y mezclando el audio. Tarda cerca de un minuto."}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-warning">
          {error}
        </p>
      ) : null}

      {video ? (
        <div className="flex flex-col gap-3">
          {/* `key` fuerza un <video> nuevo en cada generación: sin eso el
              elemento conserva el archivo anterior aunque cambie el src. */}
          <video
            key={video.src}
            src={video.src}
            controls
            playsInline
            className="w-full max-w-[280px] self-center rounded-2xl border border-border-soft bg-surface"
          />
          <a
            href={video.descarga}
            className="rounded-2xl border border-accent/40 bg-accent/15 px-4 py-3 text-center text-sm font-semibold text-accent transition active:scale-95"
          >
            Descargar video
          </a>
          <p className="text-center text-xs text-muted tabular">10 s · 1080×1920</p>
        </div>
      ) : null}
    </div>
  );
}
