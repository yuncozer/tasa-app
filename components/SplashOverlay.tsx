"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

/**
 * Splash propio de la app, encima del contenido real mientras carga.
 *
 * El splash nativo de iOS (`AppleSplashLinks`) es una imagen estática: no puede
 * animarse ni llevar la tipografía de la app. Este componente sí puede, porque
 * es HTML/CSS normal — React lo renderiza en el HTML inicial (antes de
 * hidratar), así que continúa sin corte visual justo donde termina el splash
 * nativo, con el mismo fondo. Se desvanece a los pocos cientos de ms: el
 * contenido de abajo ya llega renderizado desde el servidor (ver
 * `app/page.tsx`), así que no hay datos que esperar, solo dar tiempo a que se
 * note como una app abriendo y no como un parpadeo.
 *
 * **No sale en `/convertir/<slug>`**, y es la única excepción. Esas páginas se
 * abren desde un buscador y lo que el overlay taparía casi un segundo es justo
 * la cifra que el lector vino a ver — que además es lo que mide un buscador
 * para decidir si la página merece aparecer. En el resto de la app el splash no
 * tapa ninguna respuesta: la portada abre una calculadora vacía.
 *
 * La ruta se mira con `usePathname()` y no con una media query de CSS, ni con
 * un efecto: así el overlay **no llega a renderizarse** en esas páginas, ni
 * siquiera en el HTML del servidor, y por tanto no puede haber parpadeo.
 * Es el mismo mecanismo con el que `RegistroVisita` se salta `/admin`.
 */
export function SplashOverlay() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const temporizador = setTimeout(() => setVisible(false), 500);
    return () => clearTimeout(temporizador);
  }, []);

  // Después de los hooks, que no pueden ir detrás de un return condicional.
  if (pathname.startsWith("/convertir")) return null;

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[color:var(--background)] transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Logo className="h-14 w-14 text-[color:var(--accent)]" />
      <p className="text-2xl font-bold tracking-tight">
        La <span className="text-[color:var(--accent)]">Tasa</span>
      </p>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-[color:var(--surface)]">
        <div className="barra-splash h-full w-1/3 rounded-full bg-[color:var(--accent)]" />
      </div>
    </div>
  );
}
