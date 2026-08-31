"use client";

import { useState, useSyncExternalStore } from "react";
import { noEnServidor, sinCambios } from "@/lib/portapapeles";

/**
 * Si este navegador sabe abrir el selector nativo de "Compartir".
 *
 * La baja vacía y el valor del servidor salen de `lib/portapapeles.ts`: son
 * los mismos que ya comparten la calculadora y `/admin/noticia`, y la razón
 * de leerlo con `useSyncExternalStore` es idéntica —en el servidor no existe
 * `navigator`—. Lo único propio es la capacidad que se consulta, que aquí es
 * `share` y no `clipboard.readText`. Sin `Web Share API` el botón no se
 * muestra en vez de mostrarse roto: un botón que nunca funciona es peor que
 * no tenerlo.
 */
const hayShareApi = () => typeof navigator?.share === "function";

const CLASE_PRIMARIO =
  "rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-background transition active:scale-95";
const CLASE_SECUNDARIO =
  "rounded-2xl border border-border-soft bg-surface px-4 py-3 text-center text-sm font-semibold text-foreground transition active:scale-95";

/**
 * Textarea editable + botones de copiar/compartir para el mensaje del canal
 * de WhatsApp.
 *
 * Editable y no de solo lectura a propósito: el texto generado es un punto de
 * partida, no lo definitivo — mismo criterio que `captionOverride` en
 * noticias, no forzar lo que arma la plantilla como si fuera intocable.
 *
 * **Ningún botón puede publicar en el canal por sí solo.** WhatsApp no
 * expone los canales como destino del selector nativo —`navigator.share`
 * solo ofrece chats, grupos y estados— ni existe un esquema de enlace que
 * abra el compositor de un canal con texto precargado. Es la misma
 * limitación que impide automatizar el envío (ver `CLAUDE.md`): sin API
 * oficial de Meta, el último paso lo da una persona. Por eso el botón
 * principal es "Copiar y abrir canal": copia el mensaje y navega al canal,
 * de modo que allí solo quede pegar. "Compartir" se conserva pero dice a
 * dónde lleva de verdad —a un chat— para no prometer el canal.
 */
export function BotonCopiarTexto({
  textoInicial,
  enlaceCanal,
}: {
  textoInicial: string;
  enlaceCanal?: string;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [copiado, setCopiado] = useState(false);
  const puedeCompartir = useSyncExternalStore(sinCambios, hayShareApi, noEnServidor);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer salvo dejar el
      // texto seleccionable a mano.
    }
  }

  async function compartir() {
    try {
      await navigator.share({ text: texto });
    } catch {
      // Cancelar el selector del sistema también lanza aquí: no es un error.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        rows={10}
        className="whitespace-pre-wrap rounded-2xl border border-border-soft bg-surface px-4 py-3 text-sm leading-relaxed text-foreground"
      />

      {/*
        Es un <a> y no un botón con `window.open`: la navegación nativa no la
        bloquea el navegador, mientras que abrir una ventana después de
        esperar al portapapeles rompe la cadena del gesto del usuario.
      */}
      {enlaceCanal && (
        <a
          href={enlaceCanal}
          target="_blank"
          rel="noreferrer"
          onClick={copiar}
          className={CLASE_PRIMARIO}
        >
          Copiar y abrir canal
        </a>
      )}

      <button
        type="button"
        onClick={copiar}
        className={enlaceCanal ? CLASE_SECUNDARIO : CLASE_PRIMARIO}
      >
        {copiado ? "Copiado" : "Copiar mensaje"}
      </button>

      {puedeCompartir && (
        <button type="button" onClick={compartir} className={CLASE_SECUNDARIO}>
          Compartir en un chat
        </button>
      )}

      <p className="text-xs leading-relaxed text-muted">
        WhatsApp no deja que otra app publique en un canal, así que el último paso es
        manual: abre el canal y pega el mensaje. &quot;Compartir&quot; solo ofrece chats y
        grupos.
      </p>
    </div>
  );
}
