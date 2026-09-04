"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/admin/Spinner";

/**
 * Señal de "voy" dentro de un `<Link>`, mientras la navegación está en curso.
 *
 * Se puso en la lista de posts de `/admin/canal` porque ahí elegir un post
 * dejó de ser gratis: desde que el mensaje del canal pasa por un atajo propio,
 * ese clic crea el slug y, la primera vez, copia la miniatura a Cloudinary.
 * Son uno o dos segundos en los que antes no pasaba nada en pantalla y el
 * único indicio era que el dedo ya había tocado.
 *
 * **Tiene que ir dentro del `<Link>`**: `useLinkStatus` lee el estado del
 * enlace que lo envuelve, no de la navegación en general. Dos enlaces
 * distintos dan cada uno el suyo, que es justo lo que hace falta en una lista
 * — se ilumina el que se tocó y no todos.
 *
 * La documentación de Next lo recomienda precisamente para este caso: destino
 * dinámico y sin un `loading.js` que permita una transición instantánea. Aquí
 * el `loading.tsx` de `/admin` no entra, porque cambiar `?post=` no es navegar
 * a otro segmento.
 *
 * `aria-live="polite"` y no un `aria-hidden` como en el `Spinner` suelto: en
 * una lista de posts casi idénticos, quien no ve la pantalla necesita saber
 * cuál se está abriendo, y ese texto es la única señal.
 */
export function PendienteAlNavegar() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-accent" aria-live="polite">
      <Spinner className="size-3.5" />
      Preparando el mensaje…
    </span>
  );
}
