"use client";

import { useState } from "react";
import { Spinner } from "@/components/admin/Spinner";

const ASPECTO: Record<"1:1" | "9:16", string> = {
  "1:1": "aspect-square",
  "9:16": "aspect-[9/16]",
};

/**
 * `<img>` con una superposición de carga mientras el navegador la pide.
 *
 * Las imágenes de vista previa de `/admin` no son assets estáticos: las
 * genera Satori al vuelo (marco + foto normalizada con `sharp`, a veces
 * bajando la imagen del artículo primero), así que tardan uno o dos
 * segundos en los que antes no había ninguna señal — el `<img>` se veía en
 * blanco y no había forma de distinguir "está cargando" de "no hay nada que
 * mostrar".
 *
 * El contenedor lleva `className` (ancho, margen, borde, radio) y una
 * proporción fija (`aspecto`, 1:1 salvo que se indique 9:16); el `<img>`
 * llena ese hueco con `object-cover`. Así el esqueleto ocupa exactamente el
 * espacio final de la imagen — sin proporción no hay de qué tomar el alto
 * antes de que el navegador conozca el tamaño real— y no hay salto de
 * layout al terminar de cargar, porque el hueco ya estaba puesto.
 *
 * El estado de carga se resetea solo cuando cambia el `src` (vía `key` en
 * el `<img>` interno): al pedir una vista previa nueva con `?t=<marca>`, el
 * navegador dispara `onLoad`/`onError` de nuevo sin que el padre tenga que
 * saberlo.
 */
export function ImagenConCarga({
  src,
  alt,
  className,
  aspecto = "1:1",
}: {
  src: string;
  alt: string;
  className?: string;
  aspecto?: "1:1" | "9:16";
}) {
  const [cargada, setCargada] = useState(false);
  const [fallo, setFallo] = useState(false);

  return (
    <div className={`relative overflow-hidden ${ASPECTO[aspecto]} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada dinámicamente; next/image obligaría a declarar el host. */}
      <img
        key={src}
        src={src}
        alt={alt}
        onLoad={() => setCargada(true)}
        onError={() => {
          setCargada(true);
          setFallo(true);
        }}
        className={`h-full w-full object-cover ${cargada ? "" : "invisible"}`}
      />
      {!cargada && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-surface"
        >
          <Spinner className="size-6 text-muted" />
        </div>
      )}
      {cargada && fallo && (
        <p className="absolute inset-x-0 bottom-2 text-center text-xs text-warning">
          No se pudo cargar la imagen.
        </p>
      )}
    </div>
  );
}
