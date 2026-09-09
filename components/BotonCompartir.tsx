"use client";

import { Loader2, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
 * Cuánto se espera, tras la última tecla, para adelantar la imagen de quien ya
 * comparte. Es el mismo rebote que el destello resuelve en CSS: sin él, teclear
 * "100" pediría tres imágenes al servidor.
 */
const ESPERA_PREPARACION_MS = 1200;

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
 * ## La activación de usuario es el problema difícil de aquí
 *
 * `navigator.share()` **exige la activación transitoria** que abre el toque, y
 * esa activación caduca —unos 5 s en Chrome, y WebKit es más estricto—. La
 * imagen se pedía al servidor *dentro* del manejador y solo después se llamaba
 * a `share()`: mientras el render tardaba un segundo eso funcionaba, pero
 * verificado en un iPhone real, una invocación en frío de la función tardó ~4 s
 * y el selector **ya no apareció**. Peor: `share()` lanza ahí un
 * `NotAllowedError` que caía en el mismo `catch` escrito para tragarse el
 * "cancelé el menú", así que no se veía ni el modal ni un aviso — solo el
 * spinner apagándose. El segundo toque funcionó porque la función ya estaba
 * caliente.
 *
 * Tres piezas lo resuelven, y ninguna sirve sola:
 *
 * - **El archivo se guarda en cuanto se tiene.** Si ya está en mano, `share()`
 *   se llama **sin un solo `await` por delante**, o sea dentro del gesto, que
 *   es la única forma de que el selector no pueda rechazarlo. La caché es un
 *   `ref` y no hace falta invalidarla: la `key` de abajo remonta el componente
 *   con cada cifra nueva, así que un archivo guardado siempre es el de la cifra
 *   en pantalla.
 * - **A quien ya compartió se le adelanta la imagen.** Cuando la cifra lleva
 *   `ESPERA_PREPARACION_MS` quieta, se pide en segundo plano para que el toque
 *   la encuentre hecha. Va **solo para ellos** (`yaCompartio()`) a propósito:
 *   adelantarla siempre sería un render de Satori por cada cuenta de cada
 *   visitante, y la inmensa mayoría no comparte nada — que es justo la razón
 *   por la que esto se pedía al pulsar. Quien ya compartió una vez es
 *   exactamente quien va a volver a hacerlo, así que el costo cae donde se
 *   aprovecha. Es la otra cara del destello: uno es para el que no lo conoce,
 *   este para el que sí.
 * - **Y si aun así se pierde la activación, se dice.** Un `NotAllowedError`
 *   deja el botón en "toca de nuevo" en vez de volver al estado normal como si
 *   no hubiera pasado nada. Ese segundo toque comparte al instante, porque la
 *   imagen ya está guardada. Es el peor caso —dos toques— pero deja de
 *   parecer que la app se tragó el primero.
 *
 * ## Lo demás
 *
 * **Dice que está trabajando.** Cuando la imagen no está lista todavía, el
 * ícono se sustituye por uno que gira: la opacidad sola se lee como que el
 * toque no entró, y la reacción natural es volver a pulsar.
 *
 * **Y destella hasta que alguien lo descubre.** Es un ícono pequeño y mudo al
 * lado del de copiar, así que quien no sabe que existe no lo busca. El
 * destello lo pone `.destello-compartir` en `globals.css`: tres fogonazos
 * suaves, uno cada cinco segundos, y para. Se apaga para siempre en cuanto se
 * comparte una vez, porque ya cumplió su función y lo que queda es ruido junto
 * a la cifra que se está leyendo.
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
  const [estado, setEstado] = useState<"listo" | "preparando" | "toca-de-nuevo">("listo");

  const { amount: monto, from: origen } = conversion;

  /**
   * La imagen de **esta** cifra, una vez pedida. No lleva clave de
   * invalidación porque no la necesita: el componente se remonta con cada
   * cifra nueva (ver la `key`), y con él se vacían estos dos.
   */
  const archivo = useRef<File | null>(null);
  const peticion = useRef<Promise<File> | null>(null);

  const pedirArchivo = useCallback(async (): Promise<File> => {
    if (archivo.current) return archivo.current;

    // Se comparte la petición en curso en vez de lanzar otra: si el usuario
    // pulsa mientras la preparación de fondo sigue viva, las dos esperan la
    // misma imagen y el servidor solo la compone una vez.
    peticion.current ??= (async () => {
      const respuesta = await fetch(
        `/api/og/conversion?monto=${monto}&origen=${origen}&destino=${destino}`,
      );
      if (!respuesta.ok) throw new Error(String(respuesta.status));
      return new File([await respuesta.blob()], "la-tasa.png", { type: "image/png" });
    })();

    try {
      const listo = await peticion.current;
      archivo.current = listo;
      return listo;
    } catch (error) {
      // Se suelta para que un fallo de red no deje el botón condenado a
      // devolver siempre el mismo error: el siguiente toque reintenta.
      peticion.current = null;
      throw error;
    }
  }, [monto, origen, destino]);

  /**
   * Adelanta la imagen para quien ya comparte. Es un `useEffect` —y una de las
   * pocas excepciones del proyecto, como el de `AvisoTasas`— porque es
   * exactamente lo que un efecto describe: algo que ocurre al montarse, con su
   * limpieza. El temporizador es el rebote: este componente se remonta con
   * cada tecla del monto, así que sin él "100" pediría tres imágenes.
   */
  useEffect(() => {
    if (!puedeCompartir || !conocido || monto <= 0) return;

    const temporizador = setTimeout(() => {
      // Un fallo aquí no se enseña: nadie ha pedido nada todavía, y el toque
      // volverá a intentarlo con su propio spinner.
      void pedirArchivo().catch(() => {});
    }, ESPERA_PREPARACION_MS);

    return () => clearTimeout(temporizador);
  }, [puedeCompartir, conocido, monto, pedirArchivo]);

  if (!puedeCompartir || monto <= 0) return null;

  /**
   * El pie de texto. Se compone aparte y de forma síncrona para que la llamada
   * a `share()` no tenga nada por delante cuando el archivo ya está listo.
   *
   * El sitio sale de `location.origin` y no de `SITE_URL`: esto corre dentro
   * del `"use client"` de `Calculator`, donde esa variable no existe. Y
   * `origin` es, por definición, el sitio en el que está quien comparte.
   *
   * Si el navegador acepta archivos pero no la combinación con texto —o si no
   * hay ninguna tasa con la que resumir la conversión en una línea— se comparte
   * solo la imagen en vez de fallar, con el dominio dibujado en el pie de la
   * imagen como red de seguridad.
   */
  const cargaCon = (imagen: File): ShareData => {
    const texto = conTexto
      ? textoParaCompartir({ conversion, destino, fetchedAt, sitio: window.location.origin })
      : null;
    return texto ? { files: [imagen], text: texto } : { files: [imagen] };
  };

  const entregar = async (imagen: File) => {
    await navigator.share(cargaCon(imagen));
    registrarEvento("compartir", origen);
    // Se marca **después** de que el selector resuelva, no al pulsar: si el
    // usuario cancela, `share()` lanza y esto no corre, así que el destello
    // sigue disponible para quien abrió el menú por curiosidad y se echó atrás
    // sin llegar a mandar nada.
    marcarCompartido();
  };

  const compartir = () => {
    // Con la imagen en mano no se espera a nada: `share()` sale dentro del
    // gesto y el selector no puede rechazarla por activación caducada.
    if (archivo.current) {
      // Se vuelve a "listo" pase lo que pase, porque con el archivo en mano
      // ya no hay nada que pedirle al usuario: si venía de "toca de nuevo",
      // dejar ahí esa etiqueta después de compartir diría que hace falta un
      // toque más. Y cancelar lanza `AbortError`, que no es un fallo sino el
      // usuario cambiando de idea.
      void entregar(archivo.current)
        .catch(() => {})
        .finally(() => setEstado("listo"));
      return;
    }

    setEstado("preparando");
    void (async () => {
      try {
        await entregar(await pedirArchivo());
        setEstado("listo");
      } catch (error) {
        // La activación caducada mientras se componía la imagen: el archivo ya
        // está guardado, así que se pide un segundo toque en vez de volver al
        // estado normal como si no hubiera pasado nada.
        const perdioElGesto = error instanceof DOMException && error.name === "NotAllowedError";
        setEstado(perdioElGesto ? "toca-de-nuevo" : "listo");
      }
    })();
  };

  const preparando = estado === "preparando";
  const tocaDeNuevo = estado === "toca-de-nuevo";

  const etiqueta = preparando
    ? "Preparando la imagen para compartir"
    : tocaDeNuevo
      ? "Toca de nuevo para compartir"
      : "Compartir la conversión";

  return (
    <button
      // La `key` remonta el botón cuando cambia la cifra, y eso hace dos cosas
      // a la vez: reinicia la animación del destello y vacía el archivo
      // guardado, de modo que nunca se comparte la imagen de una cuenta
      // anterior. Con cada tecla del monto esto se remonta, y de ahí que el
      // fogonazo tarde 1,5 s (ver `globals.css`) y que la preparación de fondo
      // lleve su propio rebote: mientras se teclea no ocurre nada.
      key={`${monto}-${origen}-${destino}`}
      type="button"
      onClick={compartir}
      disabled={preparando}
      aria-busy={preparando}
      aria-label={etiqueta}
      className={`shrink-0 rounded-full p-1.5 text-[color:var(--muted)] transition active:scale-95 disabled:opacity-50 ${
        conocido || preparando || tocaDeNuevo ? "" : "destello-compartir"
      }`}
    >
      {preparando ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin text-[color:var(--accent)]" />
      ) : (
        <Share2
          aria-hidden="true"
          className={tocaDeNuevo ? "size-4 text-[color:var(--accent)]" : "size-4 opacity-60"}
        />
      )}
    </button>
  );
}
