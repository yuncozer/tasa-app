import { Info } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { formatRelative } from "@/lib/format";
import type { ParadaBorrador } from "@/lib/parada";

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
    <article className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <span>Dólar en La Parada</span>
          <Tooltip
            className="shrink-0"
            content="Tasa informal reportada a diario por lanacionweb.com en un punto físico de cambio. No es una tasa oficial ni entra en la calculadora: puede variar durante el día."
          >
            <Info aria-hidden="true" className="size-3.5 opacity-60" />
          </Tooltip>
        </h3>
        <span className="shrink-0 text-xs text-muted">{formatRelative(parada.detectadoEn)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Compran</p>
          <p className="tabular truncate text-xl font-semibold leading-none">{parada.compra} COP</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">Venden</p>
          <p className="tabular truncate text-xl font-semibold leading-none">{parada.venta} COP</p>
        </div>
      </div>

      <p className="text-xs text-muted">{parada.lugar} · billete de 100 · Fuente: lanacionweb.com</p>
    </article>
  );
}
