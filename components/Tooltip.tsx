"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  /** Clases para el <button> ancla, p. ej. "shrink-0" cuando vive en un flex. */
  className?: string;
}

export function Tooltip({ children, content, className }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  // El tooltip se renderiza (oculto) en cuanto `isVisible` es true, no cuando
  // ya hay `position`: si esperáramos a tener coordenadas para montarlo,
  // `tooltipRef.current` nunca existiría y la posición jamás se calcularía
  // (dependencia circular que dejaba el tooltip invisible siempre).
  useLayoutEffect(() => {
    // Al cerrar no hace falta limpiar `position`: la próxima vez que se abra,
    // este mismo efecto recalcula las coordenadas antes de que el navegador
    // pinte, así que un valor viejo nunca llega a mostrarse.
    if (!isVisible || !anchorRef.current || !tooltipRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let top = rect.top - tooltipRect.height - 8;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

    if (top < 8) {
      top = rect.bottom + 8;
    }

    if (left < 8) {
      left = 8;
    } else if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }

    setPosition({ top, left });
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = () => setIsVisible(false);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsVisible(false);
    };

    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isVisible]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Siempre abre (no alterna): en desktop el mouse ya entra en hover antes
    // del click, así que alternar cerraba el tooltip en el mismo click que
    // lo abría. Cerrar queda a cargo de mouseleave, tap fuera o ESC.
    setIsVisible(true);
  };

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <>
      {/* Un <button> registra el tap en un solo toque en iOS Safari; un <div>
          con onClick necesita dos toques la primera vez (el primero solo
          simula :hover). */}
      <button
        ref={anchorRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-describedby={isVisible ? tooltipId : undefined}
        // `inline-flex` para que el botón se ajuste a su contenido: con
        // `block w-full` reclamaba toda la fila y aplastaba a sus hermanos.
        // El `after` invisible agranda el área de toque de un ícono de 12 px
        // sin ocupar espacio, cosa que un padding sí haría.
        className={`relative inline-flex cursor-help appearance-none items-center border-0 bg-transparent p-0 text-inherit after:absolute after:-inset-2 after:content-[''] ${className ?? ""}`}
      >
        {children}
      </button>

      {/* El panel va a <body> por portal: las anclas viven dentro de <p> y
          <h3>, que no admiten un <div> descendiente. Sin el portal el HTML es
          inválido y React rompe la hidratación. Como ya está posicionado con
          `fixed`, sacarlo del árbol no cambia nada visualmente. */}
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={{
              position: "fixed",
              top: `${position?.top ?? 0}px`,
              left: `${position?.left ?? 0}px`,
              // Oculto hasta tener coordenadas reales: se monta igual para
              // poder medirlo, pero no debe verse saltar desde (0,0).
              visibility: position ? "visible" : "hidden",
              zIndex: 50,
            }}
            className="max-w-xs rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs text-[color:var(--muted)] shadow-lg"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
