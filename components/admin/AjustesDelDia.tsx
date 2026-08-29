"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/admin/Spinner";
import type { AjustesDia, ModoPublicacion } from "@/lib/ajustes-publicacion";

/**
 * Qué van a publicar hoy los dos disparos automáticos.
 *
 * Vive en `/admin/hoy`, junto al botón de publicar a mano, porque las dos
 * cosas responden la misma pregunta —"qué sale hoy"— desde los dos lados: una
 * añade una publicación fuera de hora y esta quita o recorta las que ya están
 * programadas.
 *
 * **El ajuste es solo para hoy y la pantalla lo dice.** Mañana no hay fila y
 * los disparos vuelven a publicar completo: un interruptor permanente sería
 * justo el que alguien deja apagado sin querer y deja la cuenta muda una
 * semana.
 *
 * Guardar no pide confirmación, al contrario que publicar: esto no manda nada
 * a la cuenta real y se deshace tocando otra opción.
 */
const OPCIONES: { modo: ModoPublicacion; etiqueta: string }[] = [
  { modo: "completo", etiqueta: "Completo" },
  { modo: "solo_carrusel", etiqueta: "Solo carrusel" },
  { modo: "solo_historias", etiqueta: "Solo historias" },
  { modo: "apagado", etiqueta: "Apagado" },
];

const NOMBRE: Record<ModoPublicacion, string> = {
  completo: "Completo",
  solo_carrusel: "Solo carrusel",
  solo_historias: "Solo historias",
  apagado: "Apagado",
};

/**
 * La descripción depende también del momento: en `completo`, las Historias
 * solo acompañan al disparo de la mañana —dos juegos idénticos el mismo día
 * saturan a quien mira— así que decir lo mismo en los dos sitios sería
 * describir algo que no pasa.
 */
function descripcion(modo: ModoPublicacion): string {
  switch (modo) {
    case "apagado":
      return "Ese disparo no publica nada hoy.";
    case "solo_historias":
      return "Las dos Historias, sin el carrusel del feed.";
    case "solo_carrusel":
      return "El carrusel en el feed, sin Historias.";
    default:
      return "El carrusel en el feed y sus dos Historias.";
  }
}

export function AjustesDelDia({
  ajustes,
  porDefecto,
}: {
  ajustes: AjustesDia;
  /**
   * Lo que tocaría hoy sin haber tocado nada, según el día de la semana. Se
   * muestra para que se vea qué es lo normal y qué es una excepción de hoy:
   * sin eso, "Apagado" en un sábado por la mañana parece algo que alguien
   * apagó y no la rutina de siempre.
   */
  porDefecto: AjustesDia;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function elegir(momento: "manana" | "tarde", modo: ModoPublicacion) {
    setGuardando(`${momento}-${modo}`);
    setError(null);

    try {
      const respuesta = await fetch("/api/admin/ajustes-publicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ momento, modo }),
      });

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}));
        setError(cuerpo.detail ?? cuerpo.error ?? "No se pudo guardar");
        return;
      }

      // El estado real lo tiene el servidor; se relee en vez de mantener aquí
      // una copia que podría quedar desfasada si falla a medias.
      router.refresh();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo guardar");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <section aria-labelledby="ajustes-hoy" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="ajustes-hoy" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Automático de hoy
        </h2>
        <p className="text-xs text-muted">
          Vale solo para hoy. Mañana cada disparo vuelve a lo que le toca por el día de la semana.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {(["manana", "tarde"] as const).map((momento) => {
          const actual = ajustes[momento];
          return (
            <div
              key={momento}
              className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {momento === "manana" ? "Mañana · 9:00" : "Tarde · 18:00"}
                </span>
                {/* Ámbar solo cuando hoy se aparta de lo normal: que un sábado
                    por la mañana diga "Apagado" es la rutina, no una excepción
                    que haya que mirar. */}
                {actual !== porDefecto[momento] && (
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                    Cambiado hoy
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {OPCIONES.map(({ modo, etiqueta }) => {
                  const seleccionado = actual === modo;
                  return (
                    <button
                      key={modo}
                      type="button"
                      onClick={() => void elegir(momento, modo)}
                      disabled={guardando !== null}
                      aria-pressed={seleccionado}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
                        seleccionado
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border-soft bg-surface-strong text-muted"
                      }`}
                    >
                      {guardando === `${momento}-${modo}` && <Spinner className="size-3" />}
                      {etiqueta}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted">
                {descripcion(actual)}
                {actual !== porDefecto[momento] && (
                  <> Lo normal en este día es «{NOMBRE[porDefecto[momento]]}».</>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
