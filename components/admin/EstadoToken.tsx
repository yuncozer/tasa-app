"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/admin/Spinner";
import { formatDate } from "@/lib/format";

/**
 * El estado del token de Instagram en `/admin`, en sus dos formas.
 *
 * Con el token sano es **una línea discreta al pie del panel**: los días que
 * le quedan y cuándo se renovó por última vez. No grita, porque no hay nada
 * que hacer — pero está, porque "¿cuánto le queda?" es una pregunta que uno
 * se hace y hasta ahora no tenía dónde responderse.
 *
 * Cuando hay algo que hacer —menos de diez días, sin registrar o ya
 * caducado— es la **franja ámbar de arriba**, con el motivo y el botón. Ese
 * caso no puede esperar a que alguien baje a buscarlo.
 *
 * El botón fuerza el refresco saltándose el umbral de veinte días del cron:
 * si alguien lo pulsa es porque no quiere esperar, y renovar antes de tiempo
 * no cuesta nada — el token nuevo vale 60 días desde ese momento. Después se
 * llama a `router.refresh()` para que el servidor vuelva a calcular el estado
 * en vez de mantener aquí una copia que tendría que actualizarse sola.
 */
export function EstadoToken({
  mensaje,
  diasRestantes,
  refrescadoEn,
}: {
  /** Presente solo cuando hay algo que hacer; es lo que decide la forma. */
  mensaje?: string;
  diasRestantes: number | null;
  refrescadoEn: string | null;
}) {
  const router = useRouter();
  const [renovando, setRenovando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renovar = async () => {
    setRenovando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/admin/token-instagram", { method: "POST" });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        // El mensaje de Meta es lo único que distingue "el token ya caducó"
        // de "todavía no tiene 24 horas", y son dos cosas muy distintas de
        // resolver: por eso se muestra tal cual y no un texto genérico.
        setError(cuerpo.detail ?? cuerpo.error ?? "No se pudo renovar");
        return;
      }

      router.refresh();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo renovar");
    } finally {
      setRenovando(false);
    }
  };

  const boton = (tono: "warning" | "muted") => (
    <button
      type="button"
      onClick={renovar}
      disabled={renovando}
      className={`flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 disabled:opacity-50 ${
        tono === "warning" ? "border-warning/40 text-warning" : "border-border-soft text-muted"
      }`}
    >
      {renovando && <Spinner className="size-3.5" />}
      {renovando ? "Renovando…" : "Renovar"}
    </button>
  );

  if (mensaje) {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3"
      >
        <p className="text-xs leading-relaxed text-warning">{mensaje}</p>
        {error && <p className="text-xs leading-relaxed text-muted">{error}</p>}
        {boton("warning")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border-soft pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Token de Instagram ·{" "}
          <span className="tabular text-foreground">
            {diasRestantes} {diasRestantes === 1 ? "día" : "días"}
          </span>{" "}
          {refrescadoEn ? `· renovado el ${formatDate(refrescadoEn)}` : null}
        </p>
        {boton("muted")}
      </div>
      {error && <p className="text-xs leading-relaxed text-muted">{error}</p>}
    </div>
  );
}
