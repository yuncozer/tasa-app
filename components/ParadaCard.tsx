import { Info } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { formatRelative } from "@/lib/format";
import type { ParadaBorrador } from "@/lib/parada";

/**
 * Las cifras las teclea el admin tal cual ("3260"); aquí se les pone el
 * separador de miles para que se lean igual que las demás de la pantalla
 * ("3.260"). Solo si son enteros de cuatro cifras o más: cualquier otra cosa
 * —un decimal, un texto— se muestra como llegó, sin adivinar.
 *
 * A mano y no con `Intl.NumberFormat`: en español el estándar no agrupa los
 * números de cuatro cifras, así que "3260" saldría igual que entró.
 */
function conMiles(valor: string): string {
  const limpio = valor.trim();
  return /^\d{4,}$/.test(limpio) ? limpio.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : limpio;
}

/**
 * "Dólar en La Parada", la tasa de calle que reporta a diario lanacionweb.com
 * en Villa del Rosario. Va **aparte** de "Tasas de hoy" y no dentro de la
 * calculadora, a propósito: las demás tasas se leen en vivo de un proveedor y
 * alimentan el motor de conversión bolívar-pivote; esta la confirma el admin
 * a mano, una vez al día, y solo cuando lanacionweb saca el artículo — no
 * tiene el mismo grado de actualidad que el resto, así que mezclarla con las
 * convertibles daría una imagen falsa de qué tan fresca es.
 *
 * Por eso no lleva selector ni entra en `RATE_ORDER`: es una referencia
 * puntual del día, no una moneda más.
 */
export function ParadaCard({ parada }: { parada: ParadaBorrador | null }) {
  if (!parada || !parada.compra || !parada.venta) return null;

  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-3">
      {/* El título es lo primero que se lee: va en el color del texto y un
          escalón por encima de las etiquetas de las demás tarjetas. */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-semibold">
          <span>Dólar en La Parada</span>
          <Tooltip
            className="shrink-0"
            content="Tasa informal reportada a diario por lanacionweb.com en un punto físico de cambio. No es una tasa oficial ni entra en la calculadora: puede variar durante el día."
          >
            <Info aria-hidden="true" className="size-3.5 opacity-60" />
          </Tooltip>
        </h3>
        <span className="shrink-0 pt-0.5 text-xs text-muted">{formatRelative(parada.detectadoEn)}</span>
      </div>

      {/* Las dos cifras son lo que se vino a buscar: cada una en su casilla,
          a lo ancho de la tarjeta y centrada, para que no quede un hueco
          vacío a la derecha cuando la pantalla es ancha. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl border border-border-soft bg-surface-strong/50 px-3 py-2 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Compran</p>
          <p className="tabular mt-1 truncate text-xl font-semibold leading-none sm:text-2xl">
            {conMiles(parada.compra)}
            <span className="ml-1.5 text-sm font-normal text-muted">COP</span>
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-border-soft bg-surface-strong/50 px-3 py-2 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Venden</p>
          <p className="tabular mt-1 truncate text-xl font-semibold leading-none sm:text-2xl">
            {conMiles(parada.venta)}
            <span className="ml-1.5 text-sm font-normal text-muted">COP</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-muted">
        {parada.lugar} · Billete de 100$ · Fuente: lanacionweb.com
      </p>
    </article>
  );
}
