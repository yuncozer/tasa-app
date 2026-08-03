"use client";

import { useEffect, useId, useRef, useState } from "react";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
}

export function Tooltip({ children, content }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  useEffect(() => {
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
    setIsVisible(!isVisible);
  };

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <>
      <div
        ref={anchorRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-describedby={isVisible ? tooltipId : undefined}
        className="cursor-help"
      >
        {children}
      </div>

      {isVisible && position && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          style={{
            position: "fixed",
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 50,
          }}
          className="max-w-xs rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs text-[color:var(--muted)] shadow-lg"
        >
          {content}
        </div>
      )}
    </>
  );
}
