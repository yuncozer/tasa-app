"use client";

import { Loader2, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";
import {
  compartioEnServidor,
  haySelectorDeArchivos,
  marcarCompartido,
  noEnServidor,
  puedeCompartirConTexto,
  sinCambios,
  suscribirCompartido,
  textoParaCompartir,
  yaCompartio,
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
 *
 * **Dice que está trabajando.** Entre el toque y el selector del sistema pasan
 * los ~0,8 s de Satori más el viaje de la imagen, y hasta ahora lo único que
 * cambiaba era la opacidad del ícono: en un teléfono con señal intermitente
 * eso se lee como que el toque no entró, y la reacción natural es volver a
 * pulsar. El ícono se sustituye por uno que gira, que es la misma señal que ya
 * usan los botones de `/admin` (`components/admin/Spinner.tsx`) — aquí no se
 * reutiliza ese componente porque vive en el panel y esto es la app pública, y
 * el ícono no es un añadido al lado del texto sino el botón entero.
 *
 * **Y destella hasta que alguien lo descubre.** Es un ícono pequeño y mudo al
 * lado del de copiar, así que quien no sabe que existe no lo busca. El
 * destello lo pone `.destello-compartir` en `globals.css`: tres fogonazos
 * suaves, uno cada cinco segundos, y para. Se apaga para siempre en cuanto se
 * comparte una vez (`yaCompartio()`), porque ya cumplió su función y lo que
 * queda es ruido junto a la cifra que se está leyendo.
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
  const conocido = useSyncExternalStore(suscribirCompartido, yaCompartio, compartioEnServidor);
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
      // Se marca **después** de que el selector resuelva, no al pulsar: si el
      // usuario cancela, `share()` lanza y esto no corre, así que el destello
      // sigue disponible para quien abrió el menú por curiosidad y se echó
      // atrás sin llegar a mandar nada.
      marcarCompartido();
    } catch {
      // Cancelar el selector lanza `AbortError`, que no es un fallo: es el
      // usuario cambiando de idea. Y si la imagen no se pudo generar, avisar
      // con un error no le da nada que hacer — le queda el botón de copiar,
      // que está al lado.
    } finally {
      setEstado("listo");
    }
  };

  const preparando = estado === "preparando";

  return (
    <button
      // La `key` remonta el botón cuando cambia la cifra, y remontarlo es lo
      // que reinicia la animación del destello: así vuelve a ofrecerse con
      // cada cuenta nueva y no una sola vez por visita. Con cada tecla del
      // monto esto se remonta, y de ahí que el fogonazo tarde 1,5 s en llegar
      // (ver el comentario de `globals.css`): mientras se teclea no se
      // enciende nada.
      key={`${monto}-${destino}`}
      type="button"
      onClick={compartir}
      disabled={preparando}
      aria-busy={preparando}
      aria-label={preparando ? "Preparando la imagen para compartir" : "Compartir la conversión"}
      className={`shrink-0 rounded-full p-1.5 text-[color:var(--muted)] transition active:scale-95 disabled:opacity-50 ${
        conocido || preparando ? "" : "destello-compartir"
      }`}
    >
      {preparando ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin text-[color:var(--accent)]" />
      ) : (
        <Share2 aria-hidden="true" className="size-4 opacity-60" />
      )}
    </button>
  );
}
