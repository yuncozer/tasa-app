"use client";

import { Calculator as IconoCalculadora, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

type Seccion = "tasas" | "calculadora";

const ATAJOS = [
  { id: "tasas", etiqueta: "Tasas de hoy", Icono: TrendingUp },
  { id: "calculadora", etiqueta: "Calculadora", Icono: IconoCalculadora },
] as const;

/**
 * Fracción de la altura de la pantalla a partir de la cual la calculadora
 * cuenta como "la sección que se está mirando": cuando su borde superior ya
 * subió por encima de ese punto. A 0 se activaría apenas asomara por abajo,
 * cuando casi toda la pantalla sigue siendo de tasas.
 */
const LINEA_DE_LECTURA = 0.4;

/** Tiempo máximo que se ignora el desplazamiento tras pulsar un botón. */
const ESPERA_SALTO_MS = 1200;

/**
 * Barra fija con dos botones para moverse entre las dos mitades de la
 * portada: las tasas y la calculadora.
 *
 * **Funciona en las dos direcciones.** Pulsar un botón desplaza la página a
 * su sección; y desplazarse a mano mueve la selección al botón de la sección
 * que se está mirando. Sin lo segundo, la barra mentía: abierta en las tasas
 * y con "Calculadora" marcada, o al revés tras bajar a mano.
 *
 * Es `sticky` y no `fixed` para que, arriba del todo, siga su sitio natural
 * bajo el logo, y solo se quede pegada al borde cuando el desplazamiento la
 * alcanza. Así desde la calculadora se vuelve a las tasas sin subir a mano.
 *
 * Detalles que importan:
 * - **Al pulsar, la selección se pone al instante y el desplazamiento
 *   automático no la mueve.** Mientras la página se desliza por el medio, el
 *   seguimiento vería "tasas" y luego "calculadora" y la barra parpadearía.
 *   Se vuelve a escuchar cuando termina el movimiento (`scrollend`) o, donde
 *   ese evento no existe, a los 1,2 s.
 * - **"Tasas de hoy" lleva arriba del todo**, no al borde de su sección: es el
 *   sitio donde se abre la app, con el logo a la vista.
 * - **Son enlaces con `href="#…"`**, así que sin JavaScript siguen saltando a
 *   la sección. El movimiento suave va con `scrollIntoView` y no con
 *   `scroll-behavior: smooth` en `<html>`, que además suavizaría cualquier
 *   otro desplazamiento de la app. Con "reducir movimiento" el salto es
 *   directo.
 */
export function AtajosPortada() {
  const [activa, setActiva] = useState<Seccion>("tasas");
  // Mientras vale `true`, el seguimiento del desplazamiento no toca `activa`.
  const saltando = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const calcular = () => {
      if (saltando.current) return;

      const calculadora = document.getElementById("calculadora");
      if (!calculadora) return;

      // Al final de la página la calculadora es lo único que queda por ver,
      // aunque su borde superior no haya llegado a la línea de lectura.
      const alFinal = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const llegada = calculadora.getBoundingClientRect().top <= window.innerHeight * LINEA_DE_LECTURA;

      setActiva(alFinal || llegada ? "calculadora" : "tasas");
    };

    calcular();
    // Directo y sin `requestAnimationFrame`: la cuenta es una sola lectura de
    // geometría y un `setState` que React descarta si el valor no cambia, así
    // que no hay nada que repartir en fotogramas.
    window.addEventListener("scroll", calcular, { passive: true });
    window.addEventListener("resize", calcular);
    return () => {
      window.removeEventListener("scroll", calcular);
      window.removeEventListener("resize", calcular);
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  const ir = (evento: MouseEvent<HTMLAnchorElement>, id: Seccion) => {
    const destino = id === "tasas" ? null : document.getElementById(id);
    if (id !== "tasas" && !destino) return;

    evento.preventDefault();
    setActiva(id);

    const liberar = () => {
      saltando.current = false;
      if (temporizador.current) clearTimeout(temporizador.current);
    };
    saltando.current = true;
    window.addEventListener("scrollend", liberar, { once: true });
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(liberar, ESPERA_SALTO_MS);

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (destino) destino.scrollIntoView({ behavior, block: "start" });
    else window.scrollTo({ top: 0, behavior });
  };

  return (
    <nav
      aria-label="Ir a una sección"
      // Franja fija: ocupa todo el ancho de la pantalla (los márgenes negativos
      // deshacen el relleno de la página) y se desenfoca el fondo para que lo
      // que pasa por debajo no se mezcle con los botones.
      className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"
    >
      <div className="grid grid-cols-2 gap-2">
        {ATAJOS.map(({ id, etiqueta, Icono }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(evento) => ir(evento, id)}
            aria-current={activa === id ? "true" : undefined}
            className={`flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
              activa === id
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-soft bg-surface text-muted"
            }`}
          >
            <Icono aria-hidden="true" className="size-4" />
            {etiqueta}
          </a>
        ))}
      </div>
    </nav>
  );
}
