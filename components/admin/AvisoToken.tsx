"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/admin/Spinner";

/**
 * La franja del panel que avisa del token de Instagram, con el botón para
 * renovarlo ahí mismo.
 *
 * El aviso lo decide el servidor (`avisoToken()` en la página) y solo baja
 * cuando hay algo que hacer: token sin registrar, a punto de caducar o ya
 * caducado. Con el token sano este componente no se monta.
 *
 * El botón existe para dos momentos: inicializar la tabla la primera vez
 * —hasta entonces no se sabe cuándo caduca el token del entorno— y rescatar
 * el caso de que el cron diario lleve días fallando. Renovar de más no tiene
 * coste: el token nuevo vale 60 días desde el momento en que se pulsa.
 *
 * Tras renovar se llama a `router.refresh()` para que el servidor vuelva a
 * calcular el aviso —y desaparezca— en vez de mantener aquí una copia del
 * estado que tendría que actualizarse sola.
 */
export function AvisoToken({ mensaje }: { mensaje: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"listo" | "renovando" | "error">("listo");
  const [error, setError] = useState<string | null>(null);

  const renovar = async () => {
    setEstado("renovando");
    setError(null);

    try {
      const respuesta = await fetch("/api/admin/token-instagram", { method: "POST" });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        // El mensaje de Meta es lo único que distingue "el token ya caducó"
        // de "todavía no tiene 24 horas", y son dos cosas muy distintas de
        // resolver: por eso se muestra tal cual en vez de un texto genérico.
        setError(cuerpo.detail ?? cuerpo.error ?? "No se pudo renovar");
        setEstado("error");
        return;
      }

      setEstado("listo");
      router.refresh();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo renovar");
      setEstado("error");
    }
  };

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <p className="text-xs leading-relaxed text-warning">{mensaje}</p>

      {error && <p className="text-xs leading-relaxed text-muted">{error}</p>}

      <button
        type="button"
        onClick={renovar}
        disabled={estado === "renovando"}
        className="flex w-fit items-center gap-1.5 rounded-full border border-warning/40 px-3 py-1 text-xs font-medium text-warning transition active:scale-95 disabled:opacity-50"
      >
        {estado === "renovando" && <Spinner className="size-3.5" />}
        {estado === "renovando" ? "Renovando…" : "Renovar ahora"}
      </button>
    </div>
  );
}
