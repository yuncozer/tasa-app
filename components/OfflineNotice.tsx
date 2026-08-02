"use client";

import { useSyncExternalStore } from "react";
import { formatRelative } from "@/lib/format";

/**
 * Franja de aviso cuando se pierde la conexión.
 *
 * Sin señal, el service worker devuelve la última página guardada y el usuario
 * ve tasas que pueden ser de hace horas. Enseñarlas sin decirlo es lo único de
 * esta app capaz de causar un perjuicio real, así que el aviso va arriba y dice
 * de cuándo son.
 */

function suscribir(alCambiar: () => void) {
  window.addEventListener("online", alCambiar);
  window.addEventListener("offline", alCambiar);

  return () => {
    window.removeEventListener("online", alCambiar);
    window.removeEventListener("offline", alCambiar);
  };
}

const estadoActual = () => !navigator.onLine;

/** En el servidor se asume conexión: así el HTML coincide con el primer pintado. */
const estadoEnServidor = () => false;

export function OfflineNotice({ fetchedAt }: { fetchedAt: string }) {
  const sinConexion = useSyncExternalStore(suscribir, estadoActual, estadoEnServidor);

  if (!sinConexion) return null;

  // Se ancla al área segura y no al borde: instalada en iPhone, el borde queda
  // bajo la barra de estado.
  return (
    <div
      role="status"
      className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 mb-1 border-b border-[color:var(--warning)]/40 bg-[color:var(--warning)]/15 px-4 py-2 text-center text-xs font-medium text-[color:var(--warning)] backdrop-blur sm:-mx-6 sm:px-6"
    >
      Sin conexión · tasas de {formatRelative(fetchedAt)}
    </div>
  );
}
