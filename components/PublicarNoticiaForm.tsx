"use client";

import { useState, useSyncExternalStore } from "react";
import type { ElementoCarruselEntrada, ProporcionCarrusel, PublicacionPayload } from "@/lib/publish-news";
import { ImagenConCarga } from "@/components/admin/ImagenConCarga";
import { Spinner } from "@/components/admin/Spinner";
import { BarraProgreso } from "@/components/BarraProgreso";
import { BotonRedactarIa } from "@/components/BotonRedactarIa";
import type { Cintillo } from "@/components/ControlCintillo";
import { ControlCintillo } from "@/components/ControlCintillo";
import { ProgramarPublicacion } from "@/components/ProgramarPublicacion";
import { SelectorMedia, type ItemMedia } from "@/components/SelectorMedia";
import { hayPortapapeles, noEnServidor, sinCambios } from "@/lib/portapapeles";
import { subirMediaConProgreso, type FaseSubida } from "@/lib/subida";

interface Preview {
  /** Vacío cuando el principal es un video: no lleva título superpuesto. */
  title: string;
  sourceHost: string;
  caption: string;
  imageUrl: string;
  /** La misma imagen, pero que el navegador guarda en vez de abrir. */
  descargaUrl: string;
}

/** Tipo de elemento principal en "Noticia propia". Con video no hay título superpuesto. */
type PrincipalTipo = "imagen" | "video";

interface Diapositiva {
  tipo: "imagen" | "video";
  url: string;
  /** La misma pieza, pero que el navegador guarda en vez de abrir. */
  descargaUrl: string;
}

/** Un elemento que el usuario sumó al carrusel, aún sin enmarcar. */
interface Extra {
  /** Clave estable de React: el `public_id` puede repetirse si se sube dos veces el mismo archivo. */
  clave: string;
  tipo: "imagen" | "video";
  publicId: string;
  /**
   * Crédito que se pinta sobre el video, propio de este clip y distinto del
   * `sourceHost` del post: el video puede venir de otro sitio que la noticia.
   * `undefined` significa "sin franja"; una cadena vacía, "pedida pero aún sin
   * escribir", que es lo que distingue la casilla activada de la apagada.
   */
  fuente?: string;
  /** Cintillo de este clip. Se decide por video, no para todo el post. */
  cintillo?: Cintillo;
  /**
   * Solo aplica a `tipo === "imagen"`: sin marco, se publica el PNG crudo tal
   * como se subió, sin pasar por la plantilla de marca. `undefined`/`false`
   * es el comportamiento de siempre.
   */
  sinMarco?: boolean;
}

type Modo = "url" | "manual";

/**
 * Subida en curso. `origen` no es decorativo: es lo que permite pintar la barra
 * justo debajo del control que se tocó, y no como un aviso suelto lejos de él —
 * en esta pantalla hay tres sitios distintos desde donde se puede subir.
 */
interface Subida {
  origen: "principal" | "extra";
  que: "imagen" | "video";
  fase: FaseSubida;
}

/**
 * Selector de archivo. El `disabled` real vive en el `<input>`, que va oculto,
 * así que la opacidad hay que ponerla a mano en la etiqueta: si no, el botón se
 * ve tocable mientras hay una subida en curso y no lo está.
 */
function claseSelector(base: string, inactivo: boolean): string {
  return `flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border-soft bg-surface-strong text-sm font-semibold text-muted transition active:scale-95 ${base}${
    inactivo ? " opacity-50" : ""
  }`;
}

/** Qué se está haciendo con el archivo, en palabras, según la fase. */
function textoDeSubida({ que, fase }: Subida): string {
  if (fase.tipo === "enviando") return que === "video" ? "Enviando el video" : "Enviando la imagen";
  return que === "video" ? "Procesando el video y aplicando la marca…" : "Procesando la imagen…";
}

/**
 * Origen del elemento principal, resuelto en el servidor (ver
 * `lib/publish-news.ts`). `video` solo sale del modo "Noticia propia": no
 * lleva título superpuesto, a diferencia de las otras dos variantes.
 */
type Principal =
  | { tipo: "subida"; publicId: string; sinMarco?: boolean }
  | { tipo: "articulo"; url: string }
  | { tipo: "video"; publicId: string; fuente?: string; titulo?: string; inicio?: number; fin?: number };

type Estado =
  | { paso: "inicial" }
  | { paso: "cargando-preview" }
  | { paso: "preview"; preview: Preview }
  | { paso: "confirmar"; preview: Preview }
  | { paso: "publicando"; preview: Preview }
  | { paso: "publicado"; mediaId: string }
  | { paso: "error"; mensaje: string };

/** Tope de Meta para un carrusel, contando la imagen principal. */
const MAX_ELEMENTOS = 10;

/**
 * Descarga lo que se está viendo. Es un enlace y no un botón con `fetch`
 * porque el servidor ya devuelve la pieza con `Content-Disposition:
 * attachment` —la imagen por cabecera, el video por `fl_attachment` de
 * Cloudinary—, y así funciona igual en iOS, donde el atributo `download` no
 * es fiable.
 */
function BotonDescargar({ url, ancho }: { url: string; ancho?: boolean }) {
  if (!url) return null;
  return (
    <a
      href={url}
      download
      className={`rounded-full border border-border-soft px-3 py-1 text-center text-xs font-medium text-muted transition active:scale-95 ${
        ancho ? "" : "w-40"
      }`}
    >
      Descargar
    </a>
  );
}

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

/**
 * Los extras tal como los espera el servidor: sin la `clave`, que solo existe
 * para React. Se arma en un sitio porque lo comparten la vista previa, publicar
 * y programar — si alguno olvidara un campo, lo publicado dejaría de ser lo
 * revisado.
 */
function aElementos(lista: Extra[]): ElementoCarruselEntrada[] {
  return lista.map(({ tipo, publicId, fuente, cintillo, sinMarco }) =>
    tipo === "video"
      ? { tipo, publicId, fuente, titulo: cintillo?.titulo, inicio: cintillo?.inicio, fin: cintillo?.fin }
      : { tipo, publicId, sinMarco },
  );
}

/** Qué selector de biblioteca está abierto, si alguno. */
type Selector = "imagen-principal" | "video-principal" | "extra-imagen" | "extra-video" | null;

/** Lo que se siembra en el estado del formulario al editar una programada. */
interface SemillaManual {
  principalTipo: PrincipalTipo;
  title: string;
  sourceHost: string;
  caption: string;
  imagenPublicId?: string;
  videoPrincipalPublicId?: string;
  fuenteVideoPrincipal?: string;
  cintilloVideoPrincipal?: Cintillo;
  imagenPrincipalSinMarco?: boolean;
  proporcion: ProporcionCarrusel;
  extras: Extra[];
}

/**
 * Reconstruye el estado del formulario a partir del payload guardado de una
 * programada. `materializarParaProgramar` garantiza que lo guardado siempre
 * es `manual` o `carrusel` (nunca `articulo`), así que solo hace falta
 * revertir esas dos formas — nunca vuelve a scrapear nada.
 */
function semillaDeEdicion(payload?: PublicacionPayload): SemillaManual | null {
  if (!payload) return null;

  if (payload.tipo === "manual") {
    return {
      principalTipo: "imagen",
      title: payload.datos.title,
      sourceHost: payload.datos.sourceHost,
      caption: payload.datos.caption,
      imagenPublicId: payload.datos.imagenPublicId,
      proporcion: "1:1",
      extras: [],
    };
  }

  if (payload.tipo === "carrusel") {
    const principal = payload.datos.principal;
    const base = {
      sourceHost: payload.datos.sourceHost,
      caption: payload.caption,
      proporcion: payload.datos.proporcion ?? ("1:1" as ProporcionCarrusel),
      extras: payload.datos.elementos.map(
        (elemento, indice): Extra =>
          elemento.tipo === "video"
            ? {
                clave: `${elemento.publicId}-${indice}`,
                tipo: "video",
                publicId: elemento.publicId,
                fuente: elemento.fuente,
                cintillo: elemento.titulo
                  ? { titulo: elemento.titulo, inicio: elemento.inicio, fin: elemento.fin }
                  : undefined,
              }
            : {
                clave: `${elemento.publicId}-${indice}`,
                tipo: "imagen",
                publicId: elemento.publicId,
                sinMarco: elemento.sinMarco === true,
              },
      ),
    };

    if (principal.tipo === "video") {
      return {
        ...base,
        principalTipo: "video",
        title: "",
        videoPrincipalPublicId: principal.publicId,
        fuenteVideoPrincipal: principal.fuente,
        cintilloVideoPrincipal: principal.titulo
          ? { titulo: principal.titulo, inicio: principal.inicio, fin: principal.fin }
          : undefined,
      };
    }

    return {
      ...base,
      principalTipo: "imagen",
      title: payload.datos.title ?? "",
      imagenPublicId: principal.tipo === "subida" ? principal.publicId : undefined,
      imagenPrincipalSinMarco: principal.tipo === "subida" && principal.sinMarco === true,
    };
  }

  return null;
}

/** Botón secundario que abre el selector de recursos ya subidos a Cloudinary. */
function BotonBiblioteca({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm font-semibold text-muted transition active:scale-95 disabled:opacity-50"
    >
      Elegir de la biblioteca
    </button>
  );
}

/**
 * Formulario de `/admin/noticia`: dos modos — pegar la URL de un artículo
 * (scraping automático) o escribir una noticia de autoría propia con imagen
 * subida a mano. En modo URL también se puede reemplazar la foto scrapeada
 * por una propia, sin perder el título/fuente/caption ya armados.
 *
 * Si se suman elementos, el post se publica como carrusel: la imagen de la
 * noticia va siempre de primera (da identidad al post y, por cómo funciona
 * Instagram, fija el formato de todo el carrusel) y lo demás va detrás en el
 * orden elegido. Publicar siempre pasa por un segundo paso de confirmación —
 * es una acción externa e irreversible.
 *
 * `edicion`, si viene, prellena el formulario con el payload guardado de una
 * programada `pendiente` en vez de arrancar en blanco — el padre
 * (`PublicarPanel`) remonta el componente con una `key` distinta por fila, así
 * que el estado inicial solo se calcula una vez por edición, sin necesidad de
 * un efecto que lo reponga.
 */
export function PublicarNoticiaForm({
  onProgramada,
  edicion,
  onCancelarEdicion,
  iaDisponible,
}: {
  onProgramada: () => void;
  edicion?: { id: string; payload: PublicacionPayload; publicarEn: string };
  onCancelarEdicion?: () => void;
  /** Si hay clave de OpenRouter. Sin ella el botón de redactar no se pinta. */
  iaDisponible: boolean;
}) {
  const semilla = semillaDeEdicion(edicion?.payload);
  const [modo, setModo] = useState<Modo>(edicion ? "manual" : "url");
  const [url, setUrl] = useState("");

  // Mismo criterio que la calculadora: el botón solo existe donde el
  // navegador deja leer el portapapeles. La lectura se hace **al pulsarlo** y
  // no al abrir la pantalla, que es lo que evita el diálogo de permiso al
  // entrar y lo que exige Safari para conceder el acceso.
  const puedePegar = useSyncExternalStore(sinCambios, hayPortapapeles, noEnServidor);

  async function pegarUrl() {
    try {
      const texto = (await navigator.clipboard.readText()).trim();
      // Si lo copiado no es un enlace no se toca lo que ya había: vaciar el
      // campo por pegar cualquier cosa sería peor que no hacer nada.
      if (!/^https?:\/\//i.test(texto)) return;
      setUrl(texto);
      setEstado({ paso: "inicial" });
    } catch {
      // El permiso se puede denegar en el momento; no hay nada que reportar.
    }
  }
  const [title, setTitle] = useState(semilla?.title ?? "");
  const [sourceHost, setSourceHost] = useState(semilla?.sourceHost ?? "");
  const [caption, setCaption] = useState(semilla?.caption ?? "");
  const [imagenPublicId, setImagenPublicId] = useState<string | undefined>(semilla?.imagenPublicId);
  /** Solo tiene efecto cuando esta imagen termina de principal de un carrusel. */
  const [imagenPrincipalSinMarco, setImagenPrincipalSinMarco] = useState(
    semilla?.imagenPrincipalSinMarco ?? false,
  );
  /** Miniatura local de la foto principal, para verla al instante sin esperar al servidor. */
  const [fotoPrincipal, setFotoPrincipal] = useState<string | undefined>();
  /** Solo aplica al modo "manual": si el principal es una imagen o un video propio. */
  const [principalTipo, setPrincipalTipo] = useState<PrincipalTipo>(semilla?.principalTipo ?? "imagen");
  const [videoPrincipalPublicId, setVideoPrincipalPublicId] = useState<string | undefined>(
    semilla?.videoPrincipalPublicId,
  );
  const [videoPrincipal, setVideoPrincipal] = useState<string | undefined>();
  /** Igual que en `Extra.fuente`: `undefined` es "sin franja", `""` es "pedida pero en blanco". */
  const [fuenteVideoPrincipal, setFuenteVideoPrincipal] = useState<string | undefined>(
    semilla?.fuenteVideoPrincipal,
  );
  const [cintilloVideoPrincipal, setCintilloVideoPrincipal] = useState<Cintillo | undefined>(
    semilla?.cintilloVideoPrincipal,
  );
  /** Proporción del carrusel; solo se elige cuando el principal es un video. */
  const [proporcion, setProporcion] = useState<ProporcionCarrusel>(semilla?.proporcion ?? "1:1");
  const [subida, setSubida] = useState<Subida | null>(null);
  const [extras, setExtras] = useState<Extra[]>(semilla?.extras ?? []);
  const [diapositivas, setDiapositivas] = useState<Diapositiva[] | null>(null);
  /** Qué selector de "elegir de la biblioteca" está abierto, si alguno. */
  const [selector, setSelector] = useState<Selector>(null);
  /**
   * El título y la fuente no van grabados en la foto: el marco los compone en
   * cada render. Así que se pueden editar después de subirla — pero entonces
   * lo que hay en pantalla deja de ser lo que se publicaría, y publicar a
   * ciegas es justo lo que hay que evitar.
   */
  const [desactualizado, setDesactualizado] = useState(false);
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  /**
   * Lo que se le manda a la IA para redactar el caption: el titular, el crédito
   * de la fuente y —como material de partida— el texto que hay ahora en el
   * campo, que en modo `url` es lo que trajo el scraper y en modo manual lo que
   * el admin escribió. Devuelve `null` mientras falte el titular o la fuente,
   * y entonces el botón se queda deshabilitado en vez de pedir a ciegas.
   */
  const cuerpoRedaccion = () => {
    const titulo = title.trim() || preview?.title?.trim();
    const fuente = sourceHost.trim() || preview?.sourceHost?.trim();
    if (!titulo || !fuente) return null;
    return { tipo: "noticia", title: titulo, sourceHost: fuente, description: caption.trim() || undefined };
  };

  const subiendo = subida !== null;
  const cargandoPreview = estado.paso === "cargando-preview";
  const publicando = estado.paso === "publicando";
  const preview = "preview" in estado ? estado.preview : null;
  /**
   * Un video principal siempre es un carrusel: no hay ruta para publicarlo
   * solo (Meta exige 2-10 elementos), así que necesita al menos un extra.
   */
  const principalEsVideo = modo === "manual" && principalTipo === "video";
  const esCarrusel = extras.length > 0 || principalEsVideo;
  const totalElementos = extras.length + 1;
  const lleno = totalElementos >= MAX_ELEMENTOS;
  /** Un carrusel necesita 2-10 elementos: con video principal y sin extras aún no alcanza. */
  const faltanElementos = principalEsVideo && extras.length === 0;

  /** Origen del elemento principal: video propio, imagen subida, o la del artículo. */
  const principal: Principal = principalEsVideo
    ? {
        tipo: "video",
        publicId: videoPrincipalPublicId ?? "",
        fuente: fuenteVideoPrincipal,
        titulo: cintilloVideoPrincipal?.titulo,
        inicio: cintilloVideoPrincipal?.inicio,
        fin: cintilloVideoPrincipal?.fin,
      }
    : imagenPublicId
      ? { tipo: "subida", publicId: imagenPublicId, sinMarco: imagenPrincipalSinMarco }
      : { tipo: "articulo", url };

  /** Sustituye la miniatura local liberando la anterior, que si no queda colgada en memoria. */
  function ponerFotoPrincipal(archivo: File | undefined) {
    setFotoPrincipal((previa) => {
      if (previa) URL.revokeObjectURL(previa);
      return archivo ? URL.createObjectURL(archivo) : undefined;
    });
  }

  /** Igual que `ponerFotoPrincipal`, pero para la miniatura del video principal. */
  function ponerVideoPrincipal(archivo: File | undefined) {
    setVideoPrincipal((previo) => {
      if (previo) URL.revokeObjectURL(previo);
      return archivo ? URL.createObjectURL(archivo) : undefined;
    });
  }

  function limpiar() {
    setUrl("");
    setTitle("");
    setSourceHost("");
    setCaption("");
    setImagenPublicId(undefined);
    ponerFotoPrincipal(undefined);
    setPrincipalTipo("imagen");
    setVideoPrincipalPublicId(undefined);
    ponerVideoPrincipal(undefined);
    setFuenteVideoPrincipal(undefined);
    setProporcion("1:1");
    setExtras([]);
    setDiapositivas(null);
    setDesactualizado(false);
    setEstado({ paso: "inicial" });
  }

  /** Igual que `ponerFotoPrincipal`, pero con la URL de un recurso ya subido en vez de un `File` local. */
  function usarFotoPrincipalRemota(url: string) {
    setFotoPrincipal((previa) => {
      if (previa?.startsWith("blob:")) URL.revokeObjectURL(previa);
      return url;
    });
  }

  /** Igual, para el video principal. */
  function usarVideoPrincipalRemoto(url: string) {
    setVideoPrincipal((previo) => {
      if (previo?.startsWith("blob:")) URL.revokeObjectURL(previo);
      return url;
    });
  }

  /**
   * Elegir de la biblioteca hace exactamente lo que hace terminar de subir un
   * archivo nuevo — cambia el `publicId` y refresca lo que dependa de él— solo
   * que sin pasar por Cloudinary, porque el recurso ya está ahí.
   */
  async function elegirImagenPrincipalDeBiblioteca(item: ItemMedia) {
    setSelector(null);
    setImagenPublicId(item.publicId);
    usarFotoPrincipalRemota(item.url);

    if (preview) {
      const endpoint = modo === "url" ? "/api/admin/preview-noticia" : "/api/admin/preview-noticia-manual";
      const body =
        modo === "url"
          ? { url, imagenPublicId: item.publicId }
          : { title, sourceHost, caption, imagenPublicId: item.publicId };
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          const data = (await response.json()) as Preview;
          setEstado({ paso: "preview", preview: { ...preview, imageUrl: data.imageUrl } });
        }
      } catch {
        // El botón de "Vista previa" sigue disponible para reintentar.
      }
      await refrescarCarrusel(extras, { tipo: "subida", publicId: item.publicId }, preview);
    }
  }

  function elegirVideoPrincipalDeBiblioteca(item: ItemMedia) {
    setSelector(null);
    setVideoPrincipalPublicId(item.publicId);
    usarVideoPrincipalRemoto(item.url);
    if (preview) {
      void refrescarCarrusel(
        extras,
        {
          tipo: "video",
          publicId: item.publicId,
          fuente: fuenteVideoPrincipal,
          titulo: cintilloVideoPrincipal?.titulo,
          inicio: cintilloVideoPrincipal?.inicio,
          fin: cintilloVideoPrincipal?.fin,
        },
        preview,
      );
    }
  }

  function elegirExtraDeBiblioteca(item: ItemMedia, tipo: "imagen" | "video") {
    setSelector(null);
    aplicarExtras([...extras, { clave: `${item.publicId}-${extras.length}`, tipo, publicId: item.publicId }]);
  }

  /** Quita la foto principal para poder subir otra. */
  function quitarFotoPrincipal() {
    setImagenPublicId(undefined);
    ponerFotoPrincipal(undefined);
    setEstado({ paso: "inicial" });
  }

  /**
   * El marco compone el título y la fuente al generar la imagen, así que
   * cambiarlos no estropea la foto ya subida: solo deja obsoleto lo que se
   * ve. Se marca para exigir regenerar antes de publicar.
   */
  function editarCampoDelMarco(asignar: () => void) {
    asignar();
    if (preview) setDesactualizado(true);
  }

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    limpiar();
  }

  /**
   * Pide al servidor las URLs finales de cada diapositiva, tal como se
   * publicarían — así lo que se ve en pantalla es exactamente lo que sale,
   * incluido el reencuadre a 1:1 del video. Se llama desde cada acción que
   * cambia la lista, no desde un efecto: la lista nueva se pasa por argumento
   * porque `setExtras` aún no se ha reflejado en el estado al invocarla.
   */
  async function refrescarCarrusel(
    lista: Extra[],
    principalActual: Principal = principal,
    previewActual: Preview | null = preview,
  ) {
    if (!previewActual || lista.length === 0) {
      setDiapositivas(null);
      return;
    }
    try {
      const response = await fetch("/api/admin/preview-carrusel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: previewActual.title || undefined,
          sourceHost: previewActual.sourceHost,
          principal: principalActual,
          elementos: aElementos(lista),
          proporcion,
        }),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const data = (await response.json()) as { elementos: Diapositiva[] };
      setDiapositivas(data.elementos);
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo generar la vista previa del carrusel" });
    }
  }

  async function verVistaPrevia() {
    setEstado({ paso: "cargando-preview" });
    try {
      // Con un video principal no hay imagen que enmarcar con título: se arma
      // la vista previa en el propio navegador, sin pasar por la ruta que
      // compone la plantilla Satori. El carrusel (incluido el video) lo
      // resuelve `refrescarCarrusel` más abajo, igual que con imagen.
      if (principalEsVideo) {
        // Sin imagen principal tampoco hay nada que descargar aquí: las descargas
        // del carrusel van por diapositiva.
        const datos: Preview = { title: "", sourceHost: sourceHost.trim(), caption, imageUrl: "", descargaUrl: "" };
        setDesactualizado(false);
        setEstado({ paso: "preview", preview: datos });
        await refrescarCarrusel(extras, principal, datos);
        return;
      }

      const endpoint = modo === "url" ? "/api/admin/preview-noticia" : "/api/admin/preview-noticia-manual";
      const body =
        modo === "url" ? { url, imagenPublicId } : { title, sourceHost, caption, imagenPublicId };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const datos = (await response.json()) as Preview;
      setCaption(datos.caption);
      setDesactualizado(false);
      setEstado({ paso: "preview", preview: datos });
      // Las diapositivas también dependen de lo que se acaba de editar —la
      // fuente del video, el título y la fuente del marco—, así que este botón
      // tiene que regenerarlas o quedarían mostrando la versión anterior.
      await refrescarCarrusel(extras, principal, datos);
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo conectar con el servidor" });
    }
  }

  /** Sustituye la foto principal. Si ya hay vista previa, la refresca sin tocar el caption editado. */
  async function reemplazarImagenPrincipal(archivo: File) {
    setSubida({ origen: "principal", que: "imagen", fase: { tipo: "enviando", porcentaje: 0 } });
    try {
      const publicId = await subirMediaConProgreso(archivo, "image", (fase) =>
        setSubida({ origen: "principal", que: "imagen", fase }),
      );
      setImagenPublicId(publicId);
      ponerFotoPrincipal(archivo);

      if (preview) {
        const endpoint = modo === "url" ? "/api/admin/preview-noticia" : "/api/admin/preview-noticia-manual";
        const body =
          modo === "url"
            ? { url, imagenPublicId: publicId }
            : { title, sourceHost, caption, imagenPublicId: publicId };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          const data = (await response.json()) as Preview;
          setEstado({ paso: "preview", preview: { ...preview, imageUrl: data.imageUrl } });
        }
        // La principal es la primera diapositiva: si cambió, el carrusel también.
        await refrescarCarrusel(extras, { tipo: "subida", publicId }, preview);
      }
    } catch (error) {
      // El servidor explica por qué falló (p. ej. el tope de 100 MB); eso dice
      // más que un «no se pudo subir» genérico.
      setEstado({ paso: "error", mensaje: error instanceof Error ? error.message : "No se pudo subir la imagen" });
    } finally {
      setSubida(null);
    }
  }

  /** Sustituye el video principal. Si ya hay vista previa, refresca el carrusel con el nuevo. */
  async function subirVideoPrincipal(archivo: File) {
    setSubida({ origen: "principal", que: "video", fase: { tipo: "enviando", porcentaje: 0 } });
    try {
      const publicId = await subirMediaConProgreso(archivo, "video", (fase) =>
        setSubida({ origen: "principal", que: "video", fase }),
      );
      setVideoPrincipalPublicId(publicId);
      ponerVideoPrincipal(archivo);
      if (preview) {
        await refrescarCarrusel(
          extras,
          {
            tipo: "video",
            publicId,
            fuente: fuenteVideoPrincipal,
            titulo: cintilloVideoPrincipal?.titulo,
            inicio: cintilloVideoPrincipal?.inicio,
            fin: cintilloVideoPrincipal?.fin,
          },
          preview,
        );
      }
    } catch (error) {
      setEstado({
        paso: "error",
        mensaje: error instanceof Error ? error.message : "No se pudo subir el video",
      });
    } finally {
      setSubida(null);
    }
  }

  /** Quita el video principal para poder subir otro. */
  function quitarVideoPrincipal() {
    setVideoPrincipalPublicId(undefined);
    ponerVideoPrincipal(undefined);
    setEstado({ paso: "inicial" });
  }

  /** Igual que `cambiarFuenteExtra`, pero para el video principal. */
  function cambiarFuenteVideoPrincipal(fuente: string | undefined) {
    editarCampoDelMarco(() => setFuenteVideoPrincipal(fuente));
  }

  /**
   * Cintillo del video principal. Como el crédito, no regenera la vista previa
   * en cada tecla: la marca la compone Cloudinary al pedir la URL, así que se
   * marca desactualizada y el usuario pulsa el botón cuando termina.
   */
  function cambiarCintilloVideoPrincipal(cintillo: Cintillo | undefined) {
    editarCampoDelMarco(() => setCintilloVideoPrincipal(cintillo));
  }

  /** Igual, para un video del carrusel: el cintillo se decide por clip. */
  function cambiarCintilloExtra(clave: string, cintillo: Cintillo | undefined) {
    editarCampoDelMarco(() => {
      setExtras(extras.map((extra) => (extra.clave === clave ? { ...extra, cintillo } : extra)));
    });
  }

  /** Aplica una lista nueva de elementos y regenera la vista previa con ella. */
  function aplicarExtras(lista: Extra[]) {
    setExtras(lista);
    void refrescarCarrusel(lista);
  }

  async function agregarExtra(archivo: File, tipo: "imagen" | "video") {
    setSubida({ origen: "extra", que: tipo, fase: { tipo: "enviando", porcentaje: 0 } });
    try {
      const publicId = await subirMediaConProgreso(archivo, tipo === "video" ? "video" : "image", (fase) =>
        setSubida({ origen: "extra", que: tipo, fase }),
      );
      // A partir de aquí toma el relevo el aviso propio del carrusel
      // («Generando vista previa del carrusel…»), así que la barra se retira.
      aplicarExtras([...extras, { clave: `${publicId}-${extras.length}`, tipo, publicId }]);
    } catch (error) {
      const generico = `No se pudo subir ${tipo === "video" ? "el video" : "la imagen"}`;
      setEstado({ paso: "error", mensaje: error instanceof Error ? error.message : generico });
    } finally {
      setSubida(null);
    }
  }

  /**
   * Cambia el crédito de un video del carrusel. No regenera la vista previa en
   * cada tecla —serían tantas transformaciones de Cloudinary como letras—: se
   * marca desactualizada, igual que al editar el título o la fuente del marco,
   * y el usuario pulsa el botón de vista previa cuando termina.
   */
  function cambiarFuenteExtra(clave: string, fuente: string | undefined) {
    editarCampoDelMarco(() => {
      setExtras(extras.map((extra) => (extra.clave === clave ? { ...extra, fuente } : extra)));
    });
  }

  /** Alterna si una imagen del carrusel lleva el marco de marca o va original. */
  function cambiarSinMarcoExtra(clave: string) {
    editarCampoDelMarco(() => {
      setExtras(extras.map((extra) => (extra.clave === clave ? { ...extra, sinMarco: !extra.sinMarco } : extra)));
    });
  }

  /** Igual, para la imagen principal cuando se usa como principal de un carrusel. */
  function cambiarSinMarcoImagenPrincipal() {
    editarCampoDelMarco(() => setImagenPrincipalSinMarco((valor) => !valor));
  }

  function quitarExtra(clave: string) {
    aplicarExtras(extras.filter((extra) => extra.clave !== clave));
  }

  /** Mueve un elemento una posición; la principal no se mueve, siempre va primero. */
  function moverExtra(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= extras.length) return;
    const copia = [...extras];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    aplicarExtras(copia);
  }

  /**
   * El post tal cual se va a ejecutar, en la forma que entiende el servidor
   * (`PublicacionPayload`). Se arma en un solo sitio para publicar y para
   * programar: si cada camino lo compusiera por su cuenta, lo que sale a la
   * hora programada podría dejar de ser lo que se probó con "Publicar".
   *
   * `null` mientras falte algo, que es lo que deshabilita el botón de
   * programar.
   */
  function construirPayload(datos: Preview | null): PublicacionPayload | null {
    if (!caption.trim()) return null;

    if (esCarrusel) {
      if (faltanElementos) return null;
      const title = datos?.title ?? "";
      const sourceHost = datos?.sourceHost ?? "";
      // El título solo hace falta cuando el principal es una imagen.
      if (!sourceHost || (principal.tipo !== "video" && !title)) return null;
      return {
        tipo: "carrusel",
        datos: {
          title: title || undefined,
          sourceHost,
          principal,
          elementos: aElementos(extras),
          proporcion,
        },
        caption,
      };
    }

    if (modo === "url") {
      return url ? { tipo: "articulo", url, caption, imagenPublicId } : null;
    }

    return imagenPublicId && title.trim() && sourceHost.trim()
      ? { tipo: "manual", datos: { title, sourceHost, caption, imagenPublicId } }
      : null;
  }

  async function publicar(datos: Preview) {
    if (
      !window.confirm(
        "Esto publica en la cuenta real de Instagram. No se puede deshacer. ¿Publicar ahora?",
      )
    ) {
      return;
    }

    setEstado({ paso: "publicando", preview: datos });
    try {
      const endpoint = esCarrusel
        ? "/api/admin/publish-carrusel"
        : modo === "url"
          ? "/api/admin/publish-noticia"
          : "/api/admin/publish-noticia-manual";

      const body = esCarrusel
        ? {
            title: datos.title || undefined,
            sourceHost: datos.sourceHost,
            caption,
            principal,
            elementos: aElementos(extras),
            proporcion,
          }
        : modo === "url"
          ? { url, caption, imagenPublicId }
          : { title, sourceHost, caption, imagenPublicId };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const data = (await response.json()) as { mediaId: string };
      setEstado({ paso: "publicado", mediaId: data.mediaId });
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo conectar con el servidor" });
    }
  }

  /**
   * El título y la fuente se imprimen sobre la foto, así que se piden antes
   * de subirla: evita elegir una imagen y descubrir después que el texto no
   * encaja con ella. Con un video principal no hay título que imprimir, así
   * que solo se exige la fuente.
   */
  const datosDelMarcoListos = principalEsVideo
    ? Boolean(sourceHost.trim())
    : Boolean(title.trim() && sourceHost.trim());
  const manualListo = Boolean(
    datosDelMarcoListos && caption.trim() && (principalEsVideo ? videoPrincipalPublicId : imagenPublicId),
  );
  const puedeVerVistaPrevia = modo === "url" ? Boolean(url) : manualListo;

  return (
    <div className="flex flex-col gap-5">
      {edicion ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
          <p className="text-sm text-accent">Editando una publicación en cola.</p>
          {onCancelarEdicion && (
            <button
              type="button"
              onClick={onCancelarEdicion}
              className="shrink-0 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium text-accent transition active:scale-95"
            >
              Cancelar edición
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-2" role="tablist" aria-label="Origen de la noticia">
          {(["url", "manual"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              role="tab"
              aria-selected={modo === opcion}
              onClick={() => cambiarModo(opcion)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                modo === opcion
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-soft bg-surface text-muted"
              }`}
            >
              {opcion === "url" ? "Desde un artículo" : "Noticia propia"}
            </button>
          ))}
        </div>
      )}

      {modo === "url" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="url-articulo" className="text-sm font-semibold uppercase tracking-wide text-muted">
            URL del artículo
          </label>
          <div className="flex gap-2">
            <input
              id="url-articulo"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setEstado({ paso: "inicial" });
              }}
              className="flex-1 rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base text-foreground outline-none"
            />
            {!url && puedePegar && (
              <button
                type="button"
                onClick={pegarUrl}
                className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm font-semibold text-muted transition active:scale-95"
              >
                Pegar
              </button>
            )}
            {url && (
              <button
                type="button"
                onClick={limpiar}
                aria-label="Limpiar URL"
                className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base font-semibold text-muted transition active:scale-95"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted">Elemento principal</span>
            <div className="flex gap-2" role="tablist" aria-label="Tipo de elemento principal">
              {(["imagen", "video"] as const).map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  role="tab"
                  aria-selected={principalTipo === opcion}
                  onClick={() => setPrincipalTipo(opcion)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                    principalTipo === opcion
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border-soft bg-surface text-muted"
                  }`}
                >
                  {opcion === "imagen" ? "Imagen" : "Video"}
                </button>
              ))}
            </div>
          </div>

          {principalTipo === "imagen" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="titulo-manual" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Título
              </label>
              <input
                id="titulo-manual"
                type="text"
                value={title}
                onChange={(e) => editarCampoDelMarco(() => setTitle(e.target.value))}
                className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base text-foreground outline-none"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="fuente-manual" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Fuente
            </label>
            <input
              id="fuente-manual"
              type="text"
              placeholder="La Tasa"
              value={sourceHost}
              onChange={(e) => editarCampoDelMarco(() => setSourceHost(e.target.value))}
              className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-base text-foreground outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="caption-manual" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Caption
            </label>
            <textarea
              id="caption-manual"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="whitespace-pre-wrap rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm text-foreground outline-none"
            />
            {iaDisponible && (
              <BotonRedactarIa
                etiqueta="Redactar con IA"
                cuerpo={cuerpoRedaccion}
                onTexto={setCaption}
                deshabilitado={publicando || !title.trim() || !sourceHost.trim()}
              />
            )}
          </div>

          {principalTipo === "imagen" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-muted">Imagen</span>

              {fotoPrincipal && (
                <div className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-strong px-3 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- previsualización local del archivo elegido. */}
                  <img
                    src={fotoPrincipal}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl border border-border-soft object-cover"
                  />
                  <span className="flex-1 text-sm text-foreground">Foto cargada</span>
                  <button
                    type="button"
                    onClick={quitarFotoPrincipal}
                    aria-label="Quitar la foto"
                    className="shrink-0 rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
                  >
                    ✕
                  </button>
                </div>
              )}

              {datosDelMarcoListos ? (
                <>
                  <div className="flex gap-2">
                    <label className={claseSelector("flex-1 px-4 py-4", subiendo)}>
                      {fotoPrincipal ? "Cambiar la foto" : "Elegir imagen"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={subiendo}
                        onChange={(e) => {
                          const archivo = e.target.files?.[0];
                          if (archivo) void reemplazarImagenPrincipal(archivo);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <BotonBiblioteca onClick={() => setSelector("imagen-principal")} disabled={subiendo} />
                  </div>
                  {subida?.origen === "principal" && (
                    <BarraProgreso fase={subida.fase} etiqueta={textoDeSubida(subida)} />
                  )}
                </>
              ) : (
                <p className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-xs text-muted">
                  Escribe primero el título y la fuente: van impresos sobre esta foto.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-muted">Video</span>
              <p className="text-xs text-muted">
                Un video principal no lleva título ni fecha impresos, solo los sellos de marca. Instagram exige
                mínimo dos elementos en el carrusel: agrega al menos una imagen o video más abajo.
              </p>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Proporción</span>
                <div className="flex gap-2" role="tablist" aria-label="Proporción del carrusel">
                  {(["1:1", "4:5"] as const).map((opcion) => (
                    <button
                      key={opcion}
                      type="button"
                      role="tab"
                      aria-selected={proporcion === opcion}
                      onClick={() => setProporcion(opcion)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                        proporcion === opcion
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border-soft bg-surface text-muted"
                      }`}
                    >
                      {opcion}
                    </button>
                  ))}
                </div>
              </div>

              {videoPrincipal && (
                <div className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-strong px-3 py-3">
                  <video
                    src={videoPrincipal}
                    controls
                    className="h-20 w-20 shrink-0 rounded-xl border border-border-soft object-cover"
                  />
                  <span className="flex-1 text-sm text-foreground">Video cargado</span>
                  <button
                    type="button"
                    onClick={quitarVideoPrincipal}
                    aria-label="Quitar el video"
                    className="shrink-0 rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
                  >
                    ✕
                  </button>
                </div>
              )}

              {datosDelMarcoListos ? (
                <>
                  <div className="flex gap-2">
                    <label className={claseSelector("flex-1 px-4 py-4", subiendo)}>
                      {videoPrincipal ? "Cambiar el video" : "Elegir video"}
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        disabled={subiendo}
                        onChange={(e) => {
                          const archivo = e.target.files?.[0];
                          if (archivo) void subirVideoPrincipal(archivo);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <BotonBiblioteca onClick={() => setSelector("video-principal")} disabled={subiendo} />
                  </div>
                  {subida?.origen === "principal" && (
                    <BarraProgreso fase={subida.fase} etiqueta={textoDeSubida(subida)} />
                  )}

                  {videoPrincipalPublicId && (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        aria-pressed={fuenteVideoPrincipal !== undefined}
                        onClick={() =>
                          cambiarFuenteVideoPrincipal(fuenteVideoPrincipal === undefined ? "" : undefined)
                        }
                        disabled={publicando}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
                          fuenteVideoPrincipal !== undefined
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border-soft bg-surface text-muted"
                        }`}
                      >
                        Acreditar la fuente en el video
                      </button>

                      {fuenteVideoPrincipal !== undefined && (
                        <input
                          value={fuenteVideoPrincipal}
                          onChange={(e) => cambiarFuenteVideoPrincipal(e.target.value)}
                          placeholder="lapatilla.com"
                          aria-label="Fuente del video principal"
                          className="rounded-xl border border-border-soft bg-surface px-4 py-3 text-base text-foreground outline-none"
                        />
                      )}

                      {/* Un video principal no lleva el titular del marco, así
                          que el cintillo es la única forma de titularlo. */}
                      <ControlCintillo
                        idPrefijo="cintillo-principal"
                        valor={cintilloVideoPrincipal}
                        onCambiar={cambiarCintilloVideoPrincipal}
                        deshabilitado={publicando}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-xs text-muted">
                  Escribe primero la fuente.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={verVistaPrevia}
        disabled={!puedeVerVistaPrevia || cargandoPreview || publicando}
        className="flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent/15 px-4 py-3 text-base font-semibold text-accent transition active:scale-95 disabled:opacity-50"
      >
        {cargandoPreview && <Spinner className="size-4" />}
        {cargandoPreview ? "Cargando vista previa…" : desactualizado ? "Actualizar vista previa" : "Vista previa"}
      </button>

      {estado.paso === "error" && (
        <p className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
          {estado.mensaje}
        </p>
      )}

      {estado.paso === "publicado" && (
        <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          Publicado. ID del post: {estado.mediaId}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border-soft bg-surface px-4 py-4">
          {desactualizado && (
            <p className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
              Cambiaste el título o la fuente: esto ya no es lo que se publicaría. Actualiza la vista previa.
            </p>
          )}

          {esCarrusel ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-muted">
                Carrusel · <span className="tabular">{totalElementos}</span> de{" "}
                <span className="tabular">{MAX_ELEMENTOS}</span>
              </span>
              {faltanElementos ? (
                <p className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-xs text-warning">
                  Instagram exige al menos dos elementos en un carrusel: agrega una imagen o video más abajo.
                </p>
              ) : diapositivas ? (
                <ul className="flex gap-2 overflow-x-auto pb-1">
                  {diapositivas.map((diapositiva, indice) => (
                    <li key={`${diapositiva.url}-${indice}`} className="flex shrink-0 flex-col gap-1">
                      {diapositiva.tipo === "video" ? (
                        <video
                          src={diapositiva.url}
                          controls
                          className="h-40 w-40 rounded-xl border border-border-soft object-cover"
                        />
                      ) : (
                        <ImagenConCarga
                          src={diapositiva.url}
                          alt=""
                          className="h-40 w-40 rounded-xl border border-border-soft"
                        />
                      )}
                      <BotonDescargar url={diapositiva.descargaUrl} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Spinner className="size-3.5" />
                  Generando vista previa del carrusel…
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <ImagenConCarga src={preview.imageUrl} alt="" className="w-full rounded-2xl border border-border-soft" />
              <BotonDescargar url={preview.descargaUrl} ancho />
            </div>
          )}

          {modo === "url" && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className={claseSelector("flex-1 px-4 py-3", subiendo || publicando)}>
                  {imagenPublicId ? "Imagen principal propia · cambiar" : "Usar una imagen propia"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={subiendo || publicando}
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      if (archivo) void reemplazarImagenPrincipal(archivo);
                      e.target.value = "";
                    }}
                  />
                </label>
                <BotonBiblioteca onClick={() => setSelector("imagen-principal")} disabled={subiendo || publicando} />
              </div>
              {subida?.origen === "principal" && (
                <BarraProgreso fase={subida.fase} etiqueta={textoDeSubida(subida)} />
              )}
            </div>
          )}

          {/* Solo importa una vez que hay carrusel: con una sola imagen, el
              principal siempre se publica enmarcado (post de noticia normal). */}
          {imagenPublicId && esCarrusel && (
            <button
              type="button"
              aria-pressed={imagenPrincipalSinMarco}
              onClick={cambiarSinMarcoImagenPrincipal}
              disabled={publicando}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
                imagenPrincipalSinMarco
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-soft bg-surface text-muted"
              }`}
            >
              {imagenPrincipalSinMarco
                ? "Imagen principal original · sin el marco de marca"
                : "Imagen principal con el marco de marca"}
            </button>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted">Añadir al carrusel</span>

            {lleno ? (
              <p className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-xs text-warning">
                Llegaste al máximo de {MAX_ELEMENTOS} elementos que permite Instagram.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <label className={claseSelector("flex-1 px-3 py-3", subiendo || publicando)}>
                    + Imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={subiendo || publicando}
                      onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        if (archivo) void agregarExtra(archivo, "imagen");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className={claseSelector("flex-1 px-3 py-3", subiendo || publicando)}>
                    + Video
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={subiendo || publicando}
                      onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        if (archivo) void agregarExtra(archivo, "video");
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <BotonBiblioteca onClick={() => setSelector("extra-imagen")} disabled={subiendo || publicando} />
                  <BotonBiblioteca onClick={() => setSelector("extra-video")} disabled={subiendo || publicando} />
                </div>
              </div>
            )}

            {subida?.origen === "extra" && <BarraProgreso fase={subida.fase} etiqueta={textoDeSubida(subida)} />}

            {extras.length > 0 && (
              <ul className="flex flex-col gap-2">
                {extras.map((extra, indice) => (
                  <li
                    key={extra.clave}
                    className="flex flex-col gap-2 rounded-xl border border-border-soft bg-surface-strong px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-foreground">
                        <span className="tabular">{indice + 2}</span>.{" "}
                        {extra.tipo === "video" ? "Video" : "Imagen"}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => moverExtra(indice, -1)}
                          disabled={indice === 0}
                          aria-label="Mover antes"
                          className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-50"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moverExtra(indice, 1)}
                          disabled={indice === extras.length - 1}
                          aria-label="Mover después"
                          className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-50"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => quitarExtra(extra.clave)}
                          aria-label="Quitar del carrusel"
                          className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {extra.tipo === "video" && (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          aria-pressed={extra.fuente !== undefined}
                          onClick={() =>
                            cambiarFuenteExtra(extra.clave, extra.fuente === undefined ? "" : undefined)
                          }
                          disabled={publicando}
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
                            extra.fuente !== undefined
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-border-soft bg-surface text-muted"
                          }`}
                        >
                          Acreditar la fuente en el video
                        </button>

                        {extra.fuente !== undefined && (
                          <input
                            value={extra.fuente}
                            onChange={(e) => cambiarFuenteExtra(extra.clave, e.target.value)}
                            placeholder="lapatilla.com"
                            aria-label="Fuente del video"
                            className="rounded-xl border border-border-soft bg-surface px-4 py-3 text-base text-foreground outline-none"
                          />
                        )}

                        <ControlCintillo
                          idPrefijo={`cintillo-${extra.clave}`}
                          valor={extra.cintillo}
                          onCambiar={(cintillo) => cambiarCintilloExtra(extra.clave, cintillo)}
                          deshabilitado={publicando}
                        />
                      </div>
                    )}

                    {extra.tipo === "imagen" && (
                      <button
                        type="button"
                        aria-pressed={extra.sinMarco === true}
                        onClick={() => cambiarSinMarcoExtra(extra.clave)}
                        disabled={publicando}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
                          extra.sinMarco
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border-soft bg-surface text-muted"
                        }`}
                      >
                        {extra.sinMarco ? "Original · sin el marco de marca" : "Con el marco de marca"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="caption" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Caption
            </label>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={8}
              className="whitespace-pre-wrap rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm text-foreground outline-none"
            />
            {/* Cambiar el caption no marca la vista previa como desactualizada:
                a diferencia del título y la fuente, no entra en la imagen
                firmada, así que lo que se ve sigue siendo lo que se publicaría. */}
            {iaDisponible && (
              <BotonRedactarIa
                etiqueta="Redactar con IA"
                cuerpo={cuerpoRedaccion}
                onTexto={setCaption}
                deshabilitado={publicando}
              />
            )}
          </div>

          <p className="text-xs text-muted">Fuente: {preview.sourceHost}</p>

          {/* En modo edición no hay publicación inmediata: es una operación
              de cola, y "Publicar ahora" queda para la fila en la cola misma. */}
          {!edicion &&
            (estado.paso === "confirmar" ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3">
                <p className="text-sm text-warning">
                  {esCarrusel
                    ? `¿Publicar ahora un carrusel de ${totalElementos} elementos en la cuenta real de Instagram?`
                    : "¿Publicar ahora en la cuenta real de Instagram?"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => publicar(preview)}
                    className="flex-1 rounded-xl border border-warning bg-warning/15 px-4 py-3 text-sm font-semibold text-warning transition active:scale-95"
                  >
                    Sí, publicar ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstado({ paso: "preview", preview })}
                    className="flex-1 rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm font-semibold text-muted transition active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEstado({ paso: "confirmar", preview })}
                disabled={publicando || subiendo || desactualizado || faltanElementos}
                className="flex items-center justify-center gap-2 rounded-xl border border-warning bg-warning/15 px-4 py-3 text-base font-semibold text-warning transition active:scale-95 disabled:opacity-50"
              >
                {publicando && <Spinner className="size-4" />}
                {publicando ? "Publicando…" : esCarrusel ? "Publicar carrusel" : "Publicar"}
              </button>
            ))}

          <ProgramarPublicacion
            payload={construirPayload(preview)}
            deshabilitado={publicando || subiendo || desactualizado || faltanElementos}
            onProgramada={onProgramada}
            edicion={edicion ? { id: edicion.id, publicarEnInicial: edicion.publicarEn } : undefined}
          />
        </div>
      )}

      {selector && (
        <SelectorMedia
          tipo={selector === "video-principal" || selector === "extra-video" ? "video" : "image"}
          onCerrar={() => setSelector(null)}
          onElegir={(item) => {
            if (selector === "imagen-principal") void elegirImagenPrincipalDeBiblioteca(item);
            else if (selector === "video-principal") elegirVideoPrincipalDeBiblioteca(item);
            else if (selector === "extra-imagen") elegirExtraDeBiblioteca(item, "imagen");
            else if (selector === "extra-video") elegirExtraDeBiblioteca(item, "video");
          }}
        />
      )}
    </div>
  );
}
