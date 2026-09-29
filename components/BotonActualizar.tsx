"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarEvento } from "@/lib/analitica-cliente";

/**
 * "Actualizar tasas", el mismo en la calculadora y en la franja de tasas
 * viejas: dos copias de un botón que navega a `?actualizar=<marca>` es como se
 * cuela una que deja de funcionar.
 *
 * Navega con una marca que cambia porque la portada lee su propia caché en
 * memoria: sin un parámetro nuevo, el botón no haría nada (ver `CLAUDE.md`).
 *
 * `destacar` lo hace latir en ámbar **solo mientras las tasas están viejas**:
 * ahí `--warning` dice lo que tiene que decir —este número no es de fiar ahora
 * mismo— y el botón es la salida. Con tasas frescas vuelve a ser discreto, para
 * no competir con la cifra que el usuario está leyendo.
 */
export function BotonActualizar({ destacar = false }: { destacar?: boolean }) {
  const [actualizando, iniciar] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        registrarEvento("actualizar");
        iniciar(() => router.replace(`/?actualizar=${Date.now()}`));
      }}
      disabled={actualizando}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 disabled:opacity-50 ${
        destacar && !actualizando
          ? "latido-actualizar border-warning/60 bg-warning/15 text-warning"
          : "border-border-soft text-muted"
      }`}
    >
      {actualizando ? "Actualizando…" : "↻ Actualizar tasas"}
    </button>
  );
}
