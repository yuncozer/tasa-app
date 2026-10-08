"use client";

import { useState, type ReactNode } from "react";

type Vista = "bolivares" | "pesos";

const VISTAS: { valor: Vista; etiqueta: string }[] = [
  { valor: "bolivares", etiqueta: "En bolívares" },
  { valor: "pesos", etiqueta: "En pesos" },
];

/**
 * Las dos láminas del post diario, también en la portada: bolívares y pesos.
 *
 * Quien sigue la cuenta ya sabe leer ese informe —cuántas filas esperar, en
 * qué orden— y la portada hablaba otro idioma: una sola lista, en bolívares,
 * sin el lado colombiano. Aquí cada vista trae las mismas filas, con los
 * mismos nombres, que la lámina que le corresponde.
 *
 * Las dos listas **llegan ya armadas desde el servidor** y esto solo decide
 * cuál se ve (`hidden`): cambiar de vista no pide nada a la red, y con las
 * dos en el HTML el contenido está ahí aunque el JavaScript tarde en cargar.
 * No se recuerda la elección: abrir siempre en bolívares es lo que hacía la
 * portada antes, y nadie que llegue desde un enlace espera encontrarla en pesos.
 */
export function VistasTasas({
  bolivares,
  pesos,
}: {
  bolivares: ReactNode;
  pesos: ReactNode;
}) {
  const [vista, setVista] = useState<Vista>("bolivares");

  return (
    <section aria-labelledby="tasas-titulo" className="flex flex-col gap-3">
      <h2
        id="tasas-titulo"
        className="text-sm font-semibold uppercase tracking-wide text-muted"
      >
        Tasas de hoy
      </h2>

      {/* A todo el ancho de la columna y justo encima de la lista: es lo que
          dice, sin tocar nada, que hay dos vistas y cuál se está mirando. Como
          píldora pequeña en una esquina nadie la veía. */}
      <div
        role="group"
        aria-label="Moneda en que se muestran las tasas"
        className="grid grid-cols-2 gap-2"
      >
        {VISTAS.map(({ valor, etiqueta }) => (
          <button
            key={valor}
            type="button"
            onClick={() => setVista(valor)}
            aria-pressed={vista === valor}
            className={`rounded-xl border px-2 py-2 text-sm font-semibold transition active:scale-95 ${
              vista === valor
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-soft bg-surface text-muted"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div hidden={vista !== "bolivares"}>{bolivares}</div>
      <div hidden={vista !== "pesos"}>{pesos}</div>
    </section>
  );
}
