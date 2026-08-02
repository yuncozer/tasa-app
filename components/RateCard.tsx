import { formatDate, formatRate } from "@/lib/format";

interface RateCardProps {
  label: string;
  symbol: string;
  /** Bandera del país de la moneda (decorativa). */
  flag: string;
  /** Bolívares por unidad. `null` cuando la fuente no respondió. */
  value: number | null;
  /** Segunda línea de valor, usada por el peso para mostrar sus dos cruces. */
  secondary?: { label: string; value: number | null };
  source: string;
  updatedAt: string | null;
  note?: string;
}

/** Tarjeta de una tasa del día. */
export function RateCard({
  label,
  symbol,
  flag,
  value,
  secondary,
  source,
  updatedAt,
  note,
}: RateCardProps) {
  const unavailable = value === null;

  return (
    <article
      className={`flex flex-col gap-2 rounded-2xl border p-4 ${
        unavailable
          ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/5"
          : "border-[color:var(--border)] bg-[color:var(--surface)]"
      }`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-baseline gap-1.5 text-sm font-medium text-[color:var(--muted)]">
          {/* La bandera acompaña al nombre; el lector de pantalla ya lee la moneda. */}
          <span aria-hidden="true" className="text-base leading-none">
            {flag}
          </span>
          {label}
        </h3>
        <span className="text-sm font-semibold text-[color:var(--accent)]">{symbol}</span>
      </header>

      <p className="tabular text-2xl font-semibold leading-none sm:text-3xl">
        {formatRate(value)}
        <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">Bs</span>
      </p>

      {secondary && (
        <p className="tabular text-sm text-[color:var(--muted)]">
          {secondary.label}:{" "}
          <span className="font-semibold text-[color:var(--foreground)]">
            {formatRate(secondary.value)} Bs
          </span>
        </p>
      )}

      {note && <p className="text-xs text-[color:var(--muted)]">{note}</p>}

      <footer className="mt-auto pt-1 text-xs text-[color:var(--muted)]">
        {unavailable ? (
          <span className="text-[color:var(--warning)]">Dato no disponible ahora mismo</span>
        ) : (
          <>
            {source} · {formatDate(updatedAt)}
          </>
        )}
      </footer>
    </article>
  );
}
