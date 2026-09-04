"use client";

import { Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";
import {
  haySelectorDeArchivos,
  noEnServidor,
  puedeCompartirConTexto,
  sinCambios,
  textoParaCompartir,
} from "@/lib/compartir";
import type { ConversionResult, RateKey } from "@/lib/types";

/**
 * Comparte la conversión como **imagen con un pie de texto**, usando el
 * selector del sistema.
 *
 * `BotonCopiar` resolvió que la cifra viajara sin transcribirla a mano, pero
 * lo que sale de ahí es un número pelado: quien lo recibe no sabe con qué tasa
 * se hizo la cuenta, de cuándo es, ni de dónde salió. La imagen lleva esas
 * cuatro cosas.
 *
 * **Y el texto lleva la quinta, que es la que las convierte en visitas.** El
 * dominio va dibujado en el pie de la imagen, pero ahí no se puede pulsar: sin
 * un enlace de verdad, compartir no produce ni una visita ni un seguidor. Va
 * en la **misma** llamada que el archivo, así que no añade ni un paso — un solo
 * toque, y el texto llega ya escrito en la caja del chat.
 *
 * **Los dos botones conviven, no se sustituyen.** Copiar sigue siendo lo que
 * hace falta cuando la cifra tiene que entrar en otra cuenta —una imagen no se
 * pega en una calculadora—, y compartir es para cuando el destino es un chat.
 *
 * **No se pinta donde el navegador no comparte archivos** (ver `lib/compartir.ts`),
 * que es casi todo el escritorio. Mismo criterio que el botón "Pegar".
 */
export function BotonCompartir({
  conversion,
  destino,
  fetchedAt,
}: {
  conversion: ConversionResult;
  /** La moneda destacada en pantalla, para que lo compartido diga lo mismo. */
  destino: RateKey;
  fetchedAt: string;
}) {
  const puedeCompartir = useSyncExternalStore(sinCambios, haySelectorDeArchivos, noEnServidor);
  const conTexto = useSyncExternalStore(sinCambios, puedeCompartirConTexto, noEnServidor);
  const [estado, setEstado] = useState<"listo" | "preparando">("listo");

  const { amount: monto, from: origen } = conversion;

  if (!puedeCompartir || monto <= 0) return null;

  const compartir = async () => {
    setEstado("preparando");
    try {
      // La imagen se pide al servidor en el momento de pulsar, no al cargar la
      // pantalla: son ~0,8 s de Satori y una lectura de tasas, y la inmensa
      // mayoría de las visitas no comparte nada.
      const respuesta = await fetch(
        `/api/og/conversion?monto=${monto}&origen=${origen}&destino=${destino}`,
      );
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      const archivo = new File([await respuesta.blob()], "la-tasa.png", { type: "image/png" });

      // El sitio sale de `location.origin` y no de `SITE_URL`: esto corre
      // dentro del `"use client"` de `Calculator`, donde esa variable no
      // existe. Y `origin` es, por definición, el sitio en el que está quien
      // comparte, así que tampoco hace falta duplicarla como `NEXT_PUBLIC_*`.
      //
      // Si el navegador acepta archivos pero no la combinación con texto —o si
      // no hay ninguna tasa con la que resumir la conversión en una línea— se
      // comparte solo la imagen en vez de fallar: el botón sigue haciendo lo
      // que hacía ayer, con el dominio dibujado en el pie de la imagen como
      // red de seguridad.
      const texto = conTexto
        ? textoParaCompartir({ conversion, destino, fetchedAt, sitio: window.location.origin })
        : null;

      await navigator.share(texto ? { files: [archivo], text: texto } : { files: [archivo] });
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
      aria-label="Compartir la conversión"
      className="shrink-0 rounded-full p-1.5 text-[color:var(--muted)] transition active:scale-95 disabled:opacity-50"
    >
      <Share2 aria-hidden="true" className="size-4 opacity-60" />
    </button>
  );
}
