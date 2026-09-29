"use client";

import { Info } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { formatPercent } from "@/lib/format";
import type { Recomendacion, Zona } from "@/lib/recomendacion";

const ZONAS: { valor: Zona; etiqueta: string }[] = [
  { valor: "interior", etiqueta: "Interior" },
  { valor: "frontera", etiqueta: "Frontera" },
];

const AYUDA: Record<Zona, string> = {
  interior:
    "Compara pagar este monto con dólares a tasa BCV contra venderlos en Binance y pagar en bolívares. Las dos cifras están en la lista de arriba. Si cobras en vez de pagar, se lee al revés.",
  frontera:
    "Compara cuántos pesos entregas para este monto a tasa oficial (TRM) y a tasa Binance. Las dos cifras están en la lista de arriba. Si cobras en vez de pagar, se lee al revés.",
};

/** La frase nombra el lado del mercado y nunca da una orden de inversión. */
function frase({ mejor, ahorro }: Recomendacion): string {
  const pct = formatPercent(ahorro);
  switch (mejor) {
    case "USD_BINANCE_SELL":
      return `Pagar en bolívares rinde más: cambiando en Binance gastas un ${pct} menos de dólares que a tasa BCV.`;
    case "USD_BCV":
      return `Pagar en dólares a tasa BCV rinde más: gastas un ${pct} menos que cambiando en Binance.`;
    case "COP_FRONTERA":
      return `En pesos, pide la tasa Binance: entregas un ${pct} menos de pesos que a tasa oficial.`;
    default:
      return `En pesos, pide la tasa oficial: entregas un ${pct} menos de pesos que a tasa Binance.`;
  }
}

/**
 * Una línea bajo las equivalencias y un selector de zona. Va compacta a
 * propósito: la zona ya está cargada de cifras, y esto es contexto sobre ellas,
 * no una cifra más. Sin recomendación posible (falta una tasa, monto en cero)
 * solo queda el selector, sin un "Sin dato" que no aporta.
 */
export function RecomendacionPago({
  recomendacion,
  zona,
  onZona,
}: {
  recomendacion: Recomendacion | null;
  zona: Zona;
  onZona: (zona: Zona) => void;
}) {
  return (
    <aside
      aria-label="Recomendación de pago"
      className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>Qué rinde más</span>
          <Tooltip className="shrink-0" content={AYUDA[zona]}>
            <Info aria-hidden="true" className="size-3.5 opacity-60" />
          </Tooltip>
        </p>
        <div role="group" aria-label="Zona de la recomendación" className="flex shrink-0 rounded-full border border-border-soft p-0.5">
          {ZONAS.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              onClick={() => onZona(valor)}
              aria-pressed={zona === valor}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition active:scale-95 ${
                zona === valor ? "bg-accent/15 text-accent" : "text-muted"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>
      {recomendacion && <p className="text-sm">{frase(recomendacion)}</p>}
    </aside>
  );
}
