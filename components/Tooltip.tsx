"use client";

import { useId } from "react";
import { Tooltip as ReactTooltip } from "react-tooltip";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  /** Clases para el <button> ancla, p. ej. "shrink-0" cuando vive en un flex. */
  className?: string;
}

export function Tooltip({ children, content, className }: TooltipProps) {
  // Generamos un ID único para enlazar este botón con su tooltip correspondiente
  const tooltipId = useId();

  return (
    <>
      <button
        type="button"
        // Atributo requerido por react-tooltip para enlazar el ancla con el panel
        data-tooltip-id={tooltipId} 
        // Mantenemos las clases originales que controlan el área de toque y layout
        className={`relative inline-flex cursor-help appearance-none items-center border-0 bg-transparent p-0 text-inherit after:absolute after:-inset-2 after:content-[''] ${className ?? ""}`}
      >
        {children}
      </button>

      <ReactTooltip
        id={tooltipId}
        // Desactiva la flechita para mantener el diseño idéntico al tuyo original
        noArrow={true}
        // Maneja automáticamente el cierre al dar click fuera o presionar ESC
        globalCloseEvents={{ escape: true, clickOutsideAnchor: true }}
        // Se aplica un z-index alto para asegurar que se muestre sobre otros elementos
        style={{ zIndex: 50 }}
        // Inyectamos tus clases originales de Tailwind para el diseño del panel. 
        // react-tooltip limpia sus estilos base si usas tus propias clases de forma agresiva, 
        // pero estas clases sobrescribirán lo necesario.
        className="max-w-xs !rounded-lg !border !border-[color:var(--border)] !bg-[color:var(--surface)] !px-3 !py-2 !text-xs !text-[color:var(--muted)] shadow-lg"
      >
        {content}
      </ReactTooltip>
    </>
  );
}