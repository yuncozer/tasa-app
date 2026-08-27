"use client";

import { RotateCw } from "lucide-react";

/**
 * Red de seguridad de la sección de analíticas.
 *
 * Lo esperable ya lo cubre la propia pantalla: una lectura fallida de
 * Supabase se muestra como un aviso dentro del bloque, y una métrica que
 * Instagram no expone sale como `—`. Esto es para lo que no se previó —un
 * fallo al renderizar, una respuesta con una forma que no esperábamos— y
 * existe para que ese caso no tumbe todo `/admin`: el boundary vive en este
 * segmento, así que la sidebar y el resto de secciones siguen en pie.
 *
 * `reset()` vuelve a intentar el render sin recargar la página entera, que es
 * lo que casi siempre hace falta: estas lecturas son de red y fallan de una
 * vez y funcionan a la siguiente.
 */
export default function ErrorAnaliticas({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-warning">No se pudieron cargar las analíticas</h2>
        <p className="text-sm text-muted">
          Es un fallo de esta pantalla: las tasas, los posts y la cola de publicaciones siguen
          funcionando igual.
        </p>
        {/* El mensaje va en letra pequeña pero va: es lo único que distingue
            "Supabase no responde" de "el token de Instagram caducó", y quien
            mira esto es quien puede arreglarlo. */}
        <p className="text-xs text-muted">{error.message}</p>
      </div>

      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-1.5 rounded-full border border-border-soft px-3 py-1.5 text-xs font-medium text-muted transition active:scale-95"
      >
        <RotateCw aria-hidden="true" className="size-3.5" />
        Reintentar
      </button>
    </div>
  );
}
