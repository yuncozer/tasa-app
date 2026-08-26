"use client";

import { useState } from "react";
import { ImagenConCarga } from "@/components/admin/ImagenConCarga";
import { Spinner } from "@/components/admin/Spinner";

/**
 * Panel de `/admin/parada`: revisa el borrador que detectó el cron, confirma
 * lugar/compra/venta a mano —nunca se adivinan de la prosa scrapeada, ver
 * `lib/parada.ts`— y publica.
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

export function ParadaPanel({ borrador }: { borrador: Borrador | null }) {
  const [lugar, setLugar] = useState(borrador?.lugar ?? "");
  const [compra, setCompra] = useState(borrador?.compra ?? "");
  const [venta, setVenta] = useState(borrador?.venta ?? "");
  const [caption, setCaption] = useState(borrador?.caption ?? "");
  const [marca, setMarca] = useState("");
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });

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
    if (
      !window.confirm("Esto publica el post en la cuenta real de Instagram. No se puede deshacer. ¿Publicar ahora?")
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
              inputMode="numeric"
              value={compra}
              onChange={(e) => setCompra(e.target.value)}
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
              inputMode="numeric"
              value={venta}
              onChange={(e) => setVenta(e.target.value)}
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
          src={`/api/og/instagram-post-parada?t=${marca}`}
          alt={`Vista previa del post: ${borrador.titulo}`}
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
