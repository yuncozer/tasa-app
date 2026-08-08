"use client";

import { useState } from "react";
import type { ElementoCarruselEntrada, PublicacionPayload } from "@/lib/publish-news";
import { BarraProgreso } from "@/components/BarraProgreso";
import { ProgramarPublicacion } from "@/components/ProgramarPublicacion";
import { subirMediaConProgreso, type FaseSubida } from "@/lib/subida";

interface Preview {
  title: string;
  sourceHost: string;
  caption: string;
  imageUrl: string;
}

interface Diapositiva {
  tipo: "imagen" | "video";
  url: string;
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

/** Origen de la imagen principal, resuelto en el servidor (ver `lib/publish-news.ts`). */
type Principal = { tipo: "subida"; publicId: string } | { tipo: "articulo"; url: string };

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
  return lista.map(({ tipo, publicId, fuente }) =>
    tipo === "video" ? { tipo, publicId, fuente } : { tipo, publicId },
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
 */
export function PublicarNoticiaForm({ onProgramada }: { onProgramada: () => void }) {
  const [modo, setModo] = useState<Modo>("url");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [sourceHost, setSourceHost] = useState("");
  const [caption, setCaption] = useState("");
  const [imagenPublicId, setImagenPublicId] = useState<string | undefined>();
  /** Miniatura local de la foto principal, para verla al instante sin esperar al servidor. */
  const [fotoPrincipal, setFotoPrincipal] = useState<string | undefined>();
  const [subida, setSubida] = useState<Subida | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [diapositivas, setDiapositivas] = useState<Diapositiva[] | null>(null);
  /**
   * El título y la fuente no van grabados en la foto: el marco los compone en
   * cada render. Así que se pueden editar después de subirla — pero entonces
   * lo que hay en pantalla deja de ser lo que se publicaría, y publicar a
   * ciegas es justo lo que hay que evitar.
   */
  const [desactualizado, setDesactualizado] = useState(false);
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

  const subiendo = subida !== null;
  const cargandoPreview = estado.paso === "cargando-preview";
  const publicando = estado.paso === "publicando";
  const preview = "preview" in estado ? estado.preview : null;
  const esCarrusel = extras.length > 0;
  const totalElementos = extras.length + 1;
  const lleno = totalElementos >= MAX_ELEMENTOS;

  /** Origen de la imagen principal: la subida manda sobre la scrapeada. */
  const principal: Principal = imagenPublicId
    ? { tipo: "subida", publicId: imagenPublicId }
    : { tipo: "articulo", url };

  /** Sustituye la miniatura local liberando la anterior, que si no queda colgada en memoria. */
  function ponerFotoPrincipal(archivo: File | undefined) {
    setFotoPrincipal((previa) => {
      if (previa) URL.revokeObjectURL(previa);
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
    setExtras([]);
    setDiapositivas(null);
    setDesactualizado(false);
    setEstado({ paso: "inicial" });
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
          title: previewActual.title,
          sourceHost: previewActual.sourceHost,
          principal: principalActual,
          elementos: aElementos(lista),
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
      const title = datos?.title ?? "";
      const sourceHost = datos?.sourceHost ?? "";
      if (!title || !sourceHost) return null;
      return {
        tipo: "carrusel",
        datos: {
          title,
          sourceHost,
          principal,
          elementos: aElementos(extras),
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
    setEstado({ paso: "publicando", preview: datos });
    try {
      const endpoint = esCarrusel
        ? "/api/admin/publish-carrusel"
        : modo === "url"
          ? "/api/admin/publish-noticia"
          : "/api/admin/publish-noticia-manual";

      const body = esCarrusel
        ? {
            title: datos.title,
            sourceHost: datos.sourceHost,
            caption,
            principal,
            elementos: aElementos(extras),
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
   * encaja con ella.
   */
  const datosDelMarcoListos = Boolean(title.trim() && sourceHost.trim());
  const manualListo = Boolean(datosDelMarcoListos && caption.trim() && imagenPublicId);
  const puedeVerVistaPrevia = modo === "url" ? Boolean(url) : manualListo;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2" role="tablist" aria-label="Origen de la noticia">
        {(["url", "manual"] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            role="tab"
            aria-selected={modo === opcion}
            onClick={() => cambiarModo(opcion)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95 ${
              modo === opcion ? "border-accent bg-accent/15 text-accent" : "border-border-soft bg-surface text-muted"
            }`}
          >
            {opcion === "url" ? "Desde un artículo" : "Noticia propia"}
          </button>
        ))}
      </div>

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
          </div>
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
                <label className={claseSelector("px-4 py-4", subiendo)}>
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
        </div>
      )}

      <button
        type="button"
        onClick={verVistaPrevia}
        disabled={!puedeVerVistaPrevia || cargandoPreview || publicando}
        className="rounded-xl border border-accent bg-accent/15 px-4 py-3 text-base font-semibold text-accent transition active:scale-95 disabled:opacity-50"
      >
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
              {diapositivas ? (
                <ul className="flex gap-2 overflow-x-auto pb-1">
                  {diapositivas.map((diapositiva, indice) => (
                    <li key={`${diapositiva.url}-${indice}`} className="shrink-0">
                      {diapositiva.tipo === "video" ? (
                        <video
                          src={diapositiva.url}
                          controls
                          className="h-40 w-40 rounded-xl border border-border-soft object-cover"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- imagen generada dinámicamente, no un asset estático.
                        <img
                          src={diapositiva.url}
                          alt=""
                          className="h-40 w-40 rounded-xl border border-border-soft object-cover"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Generando vista previa del carrusel…</p>
              )}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- imagen generada dinámicamente, no un asset estático.
            <img src={preview.imageUrl} alt="" className="w-full rounded-2xl border border-border-soft" />
          )}

          {modo === "url" && (
            <div className="flex flex-col gap-2">
              <label className={claseSelector("px-4 py-3", subiendo || publicando)}>
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
              {subida?.origen === "principal" && (
                <BarraProgreso fase={subida.fase} etiqueta={textoDeSubida(subida)} />
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted">Añadir al carrusel</span>

            {lleno ? (
              <p className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-xs text-warning">
                Llegaste al máximo de {MAX_ELEMENTOS} elementos que permite Instagram.
              </p>
            ) : (
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
                      </div>
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
          </div>

          <p className="text-xs text-muted">Fuente: {preview.sourceHost}</p>

          {estado.paso === "confirmar" ? (
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
              disabled={publicando || subiendo || desactualizado}
              className="rounded-xl border border-warning bg-warning/15 px-4 py-3 text-base font-semibold text-warning transition active:scale-95 disabled:opacity-50"
            >
              {publicando ? "Publicando…" : esCarrusel ? "Publicar carrusel" : "Publicar"}
            </button>
          )}

          <ProgramarPublicacion
            payload={construirPayload(preview)}
            deshabilitado={publicando || subiendo || desactualizado}
            onProgramada={onProgramada}
          />
        </div>
      )}
    </div>
  );
}
