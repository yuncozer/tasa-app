"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";
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

  // El evento se anota **al volver la conexión**, no al perderla: sin red no
  // hay forma de mandarlo y la analítica no guarda cola en el dispositivo (ver
  // `lib/analitica-cliente.ts`). Lo que se mide es "esta sesión llegó a usar la
  // app sin señal", que es la pregunta que justifica el service worker.
  const estuvoSinConexion = useRef(false);
  useEffect(() => {
    if (sinConexion) {
      estuvoSinConexion.current = true;
      return;
    }
    if (estuvoSinConexion.current) {
      estuvoSinConexion.current = false;
      registrarEvento("sin_conexion");
    }
  }, [sinConexion]);

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
