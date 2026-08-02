"use client";

import { useSyncExternalStore } from "react";

/**
 * Invitación discreta a instalar la app en la pantalla de inicio.
 *
 * En Android y escritorio el navegador avisa con `beforeinstallprompt` y se
 * puede abrir el diálogo nativo. iOS no dispara ese evento —la única vía es
 * Compartir → Añadir a inicio— así que allí se explican los dos pasos.
 *
 * El estado vive fuera de React porque lo produce el navegador: se expone con
 * `useSyncExternalStore`, que además da un valor distinto para el servidor y
 * evita cualquier desajuste de hidratación.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Estado = "oculto" | "instalar" | "ios";

const DESCARTADO = "tasapp:instalacion-descartada";

let evento: BeforeInstallPromptEvent | null = null;
let descartado: boolean | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  for (const oyente of oyentes) oyente();
}

function yaInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean(navigator.standalone))
  );
}

function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function suscribir(alCambiar: () => void) {
  oyentes.add(alCambiar);

  const alPoderInstalar = (e: Event) => {
    // Se frena el aviso del navegador para ofrecerlo dentro de la app.
    e.preventDefault();
    evento = e as BeforeInstallPromptEvent;
    avisar();
  };

  window.addEventListener("beforeinstallprompt", alPoderInstalar);

  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("beforeinstallprompt", alPoderInstalar);
  };
}

function estadoActual(): Estado {
  if (descartado === null) descartado = localStorage.getItem(DESCARTADO) === "1";
  if (descartado || yaInstalada()) return "oculto";
  if (evento) return "instalar";
  return esIOS() ? "ios" : "oculto";
}

const estadoEnServidor = (): Estado => "oculto";

export function InstallPrompt() {
  const estado = useSyncExternalStore(suscribir, estadoActual, estadoEnServidor);

  if (estado === "oculto") return null;

  const descartar = () => {
    localStorage.setItem(DESCARTADO, "1");
    descartado = true;
    avisar();
  };

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    evento = null;
    avisar();
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-xs text-[color:var(--muted)]">
      <p>
        {estado === "ios" ? (
          <>
            Para tenerla a mano: <strong className="font-semibold">Compartir</strong> →{" "}
            <strong className="font-semibold">Añadir a inicio</strong>
          </>
        ) : (
          "Instálala y ábrela como una app, sin buscar la dirección"
        )}
      </p>

      <div className="flex shrink-0 items-center gap-2">
        {estado === "instalar" && (
          <button
            type="button"
            onClick={instalar}
            className="rounded-full border border-[color:var(--accent)] px-3 py-1 font-semibold text-[color:var(--accent)] transition active:scale-95"
          >
            Instalar
          </button>
        )}
        <button
          type="button"
          onClick={descartar}
          aria-label="No mostrar más"
          className="rounded-full px-2 py-1 transition active:scale-95"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
