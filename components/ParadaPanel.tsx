"use client";

import { useState } from "react";
import { ImagenConCarga } from "@/components/admin/ImagenConCarga";
import { Spinner } from "@/components/admin/Spinner";

/**
 * Panel de `/admin/parada`: revisa el borrador que detectó el cron, confirma
 * lugar/compra/venta a mano —nunca se adivinan de la prosa scrapeada, ver
 * `lib/parada.ts`— y publica.
 *
 * El botón de leer con IA **no rellena nada**: enseña lo que el modelo creyó
 * leer, al lado de los campos, y los campos siguen vacíos hasta que el admin
 * teclea. Autocompletar convertiría una pista en un dato, que es justo lo que
 * esta serie no puede permitirse: es el número que el lector se lleva de un
 * vistazo y no se corrige después de publicar.
 *
 * Enseña las **dos fuentes por separado** —el texto del artículo y la foto de
 * la pizarra— y si concuerdan, porque de dónde salió cada cifra es la mitad de
 * lo que esto aporta: dos lecturas que coinciden valen mucho más que una, y dos
 * que no coinciden son el aviso de mirar el artículo con calma.
 *
 * La imagen la sirve `/api/og/instagram-post-parada`, que lee estos campos
 * directo de Supabase sin recibir nada por query string. Por eso "Actualizar
 * vista previa" primero guarda (PATCH a `/api/admin/parada`) y solo después
 * refresca el `<img>` con un parámetro que cambia — mismo truco que el
 * `?actualizar=` de la portada: sin un parámetro que cambie, el navegador
 * serviría su propia copia.
 */

interface Borrador {
  titulo: string;
  url: string;
  lugar: string;
  compra: string | null;
  venta: string | null;
  caption: string;
}

/** Estado del botón que lee la foto. Nunca toca los campos: solo se muestra. */
type Lectura = { compra: string | null; venta: string | null };

type Sugerencia =
  | { paso: "inicial" }
  | { paso: "leyendo" }
  | { paso: "leida"; foto: Lectura; texto: Lectura; coinciden: boolean }
  | { paso: "sin-lectura" }
  | { paso: "error"; mensaje: string };

/**
 * Deja pasar solo lo que tiene forma de precio: dígitos y los separadores con
 * los que se escriben acá ("3.100", "3.900,50"). El teclado va en `decimal` y
 * no en `numeric` justamente porque aquel oculta el punto, así que la cifra de
 * miles no se podía teclear; el filtro es lo que impide que, con el teclado
 * completo de escritorio, se cuele texto en un campo que después se publica.
 */
function soloCifra(valor: string): string {
  return valor.replace(/[^\d.,]/g, "");
}

/** "compran 3.900 · venden 3.950", con guion donde no se leyó nada. */
function resumenLectura({ compra, venta }: Lectura): string {
  return `compran ${compra ?? "—"} · venden ${venta ?? "—"}`;
}

type Estado =
  | { paso: "inicial" }
  | { paso: "guardando" }
  | { paso: "publicando" }
  | { paso: "publicado"; mediaId: string }
  | { paso: "error"; mensaje: string };

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

export function ParadaPanel({
  borrador,
  esDeHoy,
  visionDisponible,
}: {
  borrador: Borrador | null;
  /** Si hay algún modelo con visión configurado. Sin él, el botón no se pinta. */
  visionDisponible?: boolean;
  /**
   * Si la columna guardada es la de hoy (`null` = no se pudo saber). Solo se
   * usa para el diálogo de confirmación: la franja de aviso ya la pinta la
   * página, pero el diálogo es la última línea antes de que salga a la cuenta
   * real, y ahí conviene repetirlo.
   */
  esDeHoy?: boolean | null;
}) {
  const [lugar, setLugar] = useState(borrador?.lugar ?? "");
  const [compra, setCompra] = useState(borrador?.compra ?? "");
  const [venta, setVenta] = useState(borrador?.venta ?? "");
  const [caption, setCaption] = useState(borrador?.caption ?? "");
  const [marca, setMarca] = useState("");
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });
  /**
   * Lo que el modelo creyó leer en la foto, o el motivo de que no haya nada.
   * Vive aparte de `compra`/`venta` a propósito: son dos cosas distintas y
   * mezclarlas en el mismo estado sería el primer paso hacia rellenarlos.
   */
  const [sugerencia, setSugerencia] = useState<Sugerencia>({ paso: "inicial" });

  async function leerFoto() {
    setSugerencia({ paso: "leyendo" });
    try {
      // Sin cuerpo: la URL de la foto la saca el servidor del borrador, para
      // no dejar que el navegador elija qué imagen se manda a leer.
      const response = await fetch("/api/admin/parada/cifras", { method: "POST" });
      if (!response.ok) {
        setSugerencia({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const { sugerencia: leida } = await response.json();
      if (!leida) {
        setSugerencia({ paso: "sin-lectura" });
        return;
      }
      setSugerencia({
        paso: "leida",
        foto: leida.foto,
        texto: leida.texto,
        coinciden: Boolean(leida.coinciden),
      });
    } catch (error) {
      setSugerencia({ paso: "error", mensaje: error instanceof Error ? error.message : "Fallo de red" });
    }
  }

  if (!borrador) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-4">
        <p className="text-sm text-muted">
          Todavía no hay ningún borrador pendiente. Un cron revisa la categoría Frontera de lanacionweb.com cada
          pocos minutos y te avisa por correo en cuanto sale el artículo de hoy.
        </p>
      </section>
    );
  }

  const guardando = estado.paso === "guardando";
  const publicando = estado.paso === "publicando";
  const publicado = estado.paso === "publicado";
  const camposCompletos = compra.trim() !== "" && venta.trim() !== "";

  async function guardarVistaPrevia() {
    setEstado({ paso: "guardando" });
    try {
      const response = await fetch("/api/admin/parada", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lugar, compra, venta, caption }),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      setMarca(String(Date.now()));
      setEstado({ paso: "inicial" });
    } catch (error) {
      setEstado({ paso: "error", mensaje: error instanceof Error ? error.message : "Fallo de red" });
    }
  }

  async function publicar() {
    const aviso =
      esDeHoy === false
        ? "OJO: este borrador no es la columna de hoy, sino la de otro día. "
        : "";

    if (
      !window.confirm(
        `${aviso}Esto publica el post en la cuenta real de Instagram. No se puede deshacer. ¿Publicar ahora?`,
      )
    ) {
      return;
    }

    setEstado({ paso: "publicando" });
    try {
      const response = await fetch("/api/admin/publish-parada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lugar, compra, venta, caption }),
      });
      if (!response.ok) {
        setEstado({ paso: "error", mensaje: await leerError(response) });
        return;
      }
      const body = await response.json();
      setEstado({ paso: "publicado", mediaId: body.mediaId });
    } catch (error) {
      setEstado({ paso: "error", mensaje: error instanceof Error ? error.message : "Fallo de red" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-3">
        <p className="text-sm font-medium">{borrador.titulo}</p>
        <a
          href={borrador.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted underline underline-offset-2"
        >
          Ver artículo original en lanacionweb.com
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="lugar-parada" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Lugar
          </label>
          <input
            id="lugar-parada"
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm text-foreground outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="compra-parada" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Compran
            </label>
            <input
              id="compra-parada"
              inputMode="decimal"
              value={compra}
              onChange={(e) => setCompra(soloCifra(e.target.value))}
              placeholder="Sin confirmar"
              className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm tabular text-foreground outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="venta-parada" className="text-sm font-semibold uppercase tracking-wide text-muted">
              Venden
            </label>
            <input
              id="venta-parada"
              inputMode="decimal"
              value={venta}
              onChange={(e) => setVenta(soloCifra(e.target.value))}
              placeholder="Sin confirmar"
              className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm tabular text-foreground outline-none placeholder:text-muted"
            />
          </div>
        </div>
        {!camposCompletos && (
          <p className="text-xs leading-relaxed text-warning">
            Confirmá compra y venta (billete de 100) leyendo el artículo — no se extraen solas del texto.
          </p>
        )}

        {visionDisponible && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={leerFoto}
              disabled={sugerencia.paso === "leyendo" || guardando || publicando}
              className="flex items-center gap-1.5 self-start rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-50"
            >
              {sugerencia.paso === "leyendo" && <Spinner className="size-3.5" />}
              {sugerencia.paso === "leyendo" ? "Leyendo el artículo…" : "Leer cifras con IA"}
            </button>

            {sugerencia.paso === "leida" && (
              /* Deliberadamente fuera de los campos y sin botón para copiarlo:
                 es una pista que hay que contrastar, no un valor que aceptar.
                 Las dos fuentes van separadas incluso cuando coinciden: saber
                 de dónde salió cada cifra es la mitad de lo que esto aporta. */
              <div className="flex flex-col gap-0.5">
                <p className="tabular text-xs leading-relaxed text-muted">
                  En el texto del artículo: {resumenLectura(sugerencia.texto)}
                </p>
                <p className="tabular text-xs leading-relaxed text-muted">
                  En la foto de la pizarra: {resumenLectura(sugerencia.foto)}
                </p>
                {sugerencia.coinciden ? (
                  <p className="text-xs leading-relaxed text-muted">
                    Las dos fuentes coinciden. Aun así, escribí las cifras vos: esto es una lectura de la IA, no
                    el dato.
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed text-warning">
                    Las dos fuentes no dicen lo mismo, o una no se pudo leer. Mirá el artículo antes de teclear.
                  </p>
                )}
              </div>
            )}
            {sugerencia.paso === "sin-lectura" && (
              <p className="text-xs leading-relaxed text-muted">
                No se pudieron leer las cifras. Escribilas leyendo el artículo, como siempre.
              </p>
            )}
            {sugerencia.paso === "error" && <p className="text-xs text-warning">{sugerencia.mensaje}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={guardarVistaPrevia}
          disabled={guardando}
          className="flex items-center justify-center gap-1.5 rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95 disabled:opacity-60"
        >
          {guardando && <Spinner className="size-3.5" />}
          {guardando ? "Guardando…" : "Actualizar vista previa"}
        </button>
      </section>

      {marca && (
        <ImagenConCarga
          src={`/api/og/instagram-post-parada?borrador=1&t=${marca}`}
          alt={`Vista previa del post: ${borrador.titulo}`}
          aspecto="4:5"
          className="h-auto w-full rounded-2xl border border-border-soft"
        />
      )}
      {!marca && (
        <p className="text-xs text-muted">Tocá &quot;Actualizar vista previa&quot; para generar la imagen con estos datos.</p>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="caption-parada" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Caption
        </label>
        <textarea
          id="caption-parada"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={10}
          className="whitespace-pre-wrap rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-sm text-foreground outline-none"
        />
      </section>

      <button
        type="button"
        onClick={publicar}
        disabled={publicando || publicado || !camposCompletos}
        className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-background transition active:scale-95 disabled:opacity-60"
      >
        {publicando && <Spinner className="size-4" />}
        {publicando ? "Publicando…" : publicado ? "Publicado" : "Publicar ahora"}
      </button>

      {estado.paso === "publicado" && <p className="text-xs text-accent">Publicado. Media ID: {estado.mediaId}</p>}
      {estado.paso === "error" && <p className="text-xs text-warning">{estado.mensaje}</p>}
    </div>
  );
}
