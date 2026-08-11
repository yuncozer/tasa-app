"use client";

import { useEffect, useState } from "react";

export interface ItemMedia {
  publicId: string;
  resourceType: "image" | "video";
  format: string;
  url: string;
  createdAt: string;
  bytes: number;
}

async function leerError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error ? `${body.error}${body.detail ? `: ${body.detail}` : ""}` : `Error ${response.status}`;
}

/**
 * Modal para elegir un recurso ya subido a Cloudinary en vez de subir uno
 * nuevo, y ahorrar así la cuota y el tiempo de repetir un archivo que ya está
 * en la cuenta. Primer modal del proyecto: el resto de la interfaz no lo
 * necesitaba hasta ahora, así que es un overlay simple sin librería, que se
 * cierra tocando el fondo o con Escape.
 *
 * Se monta y desmonta con cada apertura —no lleva un `abierto` propio—, así
 * que la lista se pide una sola vez al montar sin depender de un efecto que
 * reaccione a cambios de `tipo`.
 */
export function SelectorMedia({
  tipo,
  onCerrar,
  onElegir,
}: {
  tipo: "image" | "video";
  onCerrar: () => void;
  onElegir: (item: ItemMedia) => void;
}) {
  const [items, setItems] = useState<ItemMedia[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar(cursorActual?: string) {
    setCargando(true);
    setError(null);
    try {
      const url = new URL("/api/admin/media", window.location.origin);
      url.searchParams.set("tipo", tipo);
      if (cursorActual) url.searchParams.set("cursor", cursorActual);

      const response = await fetch(url);
      if (!response.ok) {
        setError(await leerError(response));
        return;
      }
      const pagina = (await response.json()) as { items: ItemMedia[]; siguienteCursor?: string };
      setItems((previo) => (cursorActual ? [...previo, ...pagina.items] : pagina.items));
      setCursor(pagina.siguienteCursor);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // Es justo lo que el modal necesita al abrirse: pedir la primera página.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar, no una sincronización derivada.
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-3 py-3 sm:items-center"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-2xl border border-border-soft bg-surface p-4"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Elegir {tipo === "video" ? "un video" : "una imagen"}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">{error}</p>
        )}

        {items.length === 0 && cargando ? (
          <p className="text-xs text-muted">Cargando…</p>
        ) : items.length === 0 && !error ? (
          <p className="text-xs text-muted">No hay nada subido todavía.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.publicId}
                type="button"
                onClick={() => onElegir(item)}
                className="aspect-square overflow-hidden rounded-xl border border-border-soft bg-surface-strong transition active:scale-95"
              >
                {tipo === "video" ? (
                  <video src={item.url} muted className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura de un recurso remoto, no un asset estático.
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}

        {cursor && (
          <button
            type="button"
            onClick={() => void cargar(cursor)}
            disabled={cargando}
            className="rounded-xl border border-border-soft px-4 py-2 text-sm font-semibold text-muted transition active:scale-95 disabled:opacity-50"
          >
            {cargando ? "Cargando…" : "Cargar más"}
          </button>
        )}
      </div>
    </div>
  );
}
