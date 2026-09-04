"use client";

import { Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";
import { haySelectorDeArchivos, noEnServidor, sinCambios } from "@/lib/compartir";
import type { RateKey } from "@/lib/types";

/**
 * Comparte la conversión como **imagen**, con el selector del sistema.
 *
 * `BotonCopiar` resolvió que la cifra viajara sin transcribirla a mano, pero
 * lo que sale de ahí es un número pelado: quien lo recibe no sabe con qué tasa
 * se hizo la cuenta, de cuándo es, ni de dónde salió, y no tiene forma de
 * volver a la app. El dato más compartido del proyecto viajaba sin nada que lo
 * respaldara. La imagen lleva esas cuatro cosas.
 *
 * **Los dos botones conviven, no se sustituyen.** Copiar sigue siendo lo que
 * hace falta cuando la cifra tiene que entrar en otra cuenta —una imagen no se
 * pega en una calculadora—, y compartir es para cuando el destino es un chat.
 *
 * **No se pinta donde el navegador no comparte archivos** (ver `lib/compartir.ts`),
 * que es casi todo el escritorio. Mismo criterio que el botón "Pegar".
 */
export function BotonCompartir({ monto, origen }: { monto: number; origen: RateKey }) {
  const puedeCompartir = useSyncExternalStore(sinCambios, haySelectorDeArchivos, noEnServidor);
  const [estado, setEstado] = useState<"listo" | "preparando">("listo");

  if (!puedeCompartir || monto <= 0) return null;

  const compartir = async () => {
    setEstado("preparando");
    try {
      // La imagen se pide al servidor en el momento de pulsar, no al cargar la
      // pantalla: son ~0,8 s de Satori y una lectura de tasas, y la inmensa
      // mayoría de las visitas no comparte nada.
      const respuesta = await fetch(`/api/og/conversion?monto=${monto}&origen=${origen}`);
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      const archivo = new File([await respuesta.blob()], "la-tasa.png", { type: "image/png" });
      await navigator.share({ files: [archivo] });
      registrarEvento("compartir", origen);
    } catch {
      // Cancelar el selector lanza `AbortError`, que no es un fallo: es el
      // usuario cambiando de idea. Y si la imagen no se pudo generar, avisar
      // con un error no le da nada que hacer — le queda el botón de copiar,
      // que está al lado.
    } finally {
      setEstado("listo");
    }
  };

  return (
    <button
      type="button"
      onClick={compartir}
      disabled={estado === "preparando"}
      aria-label="Compartir la conversión como imagen"
      className="shrink-0 rounded-full p-1.5 text-[color:var(--muted)] transition active:scale-95 disabled:opacity-50"
    >
      <Share2 aria-hidden="true" className="size-4 opacity-60" />
    </button>
  );
}
