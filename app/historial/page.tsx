import Link from "next/link";
import { Logo } from "@/components/Logo";
import { formatFecha, formatRate } from "@/lib/format";
import { listarHistorico, type Momento } from "@/lib/historico";
import { RATE_ORDER, rateMeta } from "@/lib/rates";
import type { RateKey } from "@/lib/types";

const MOMENTO_LABEL: Record<Momento, string> = {
  manana: "9:00 am",
  tarde: "6:00 pm",
};

/** El bolívar (`VES`) no es una tasa que se cruce contra sí misma, así que no
 * tiene sentido archivarlo ni elegirlo aquí — mismo filtro que usa `RatePanel`. */
const CLAVES_HISTORIAL = RATE_ORDER.filter((key): key is Exclude<RateKey, "VES"> => key !== "VES");

function claveValida(valor: string | undefined): RateKey {
  return CLAVES_HISTORIAL.find((key) => key === valor) ?? "USD_BINANCE_SELL";
}

/**
 * Historial de las lecturas que el cron de tasas archiva dos veces al día
 * (9:00 am y 6:00 pm en Caracas, ver `lib/historico.ts`). Responde lo que el
 * panel de "hoy" no puede: cómo estuvo una tasa en un momento concreto de un
 * día pasado — "¿cómo estuvo el Binance venta antier a las 6:00 pm?".
 *
 * La tasa elegida viaja por query string (`?clave=`), no por estado de
 * cliente: mismo criterio que el botón "Actualizar tasas" de la portada, la
 * página ya se renderiza en el servidor y un enlace normal resuelve el caso
 * sin JavaScript de por medio.
 */
export default async function Historial({
  searchParams,
}: {
  searchParams: Promise<{ clave?: string }>;
}) {
  const { clave: claveParam } = await searchParams;
  const clave = claveValida(claveParam);

  let puntos: Awaited<ReturnType<typeof listarHistorico>> = [];
  let error = false;
  try {
    puntos = await listarHistorico(clave);
  } catch {
    error = true;
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center gap-3">
        <Logo className="h-10 w-10 shrink-0 text-[color:var(--accent)]" />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold leading-none tracking-tight">Historial de tasas</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Cómo estuvo cada tasa a las 9:00 am y a las 6:00 pm
          </p>
        </div>
      </header>

      <nav aria-label="Elegir tasa" className="flex flex-wrap gap-2">
        {CLAVES_HISTORIAL.map((key) => {
          const seleccionada = key === clave;
          return (
            <Link
              key={key}
              href={`/historial?clave=${key}`}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95 ${seleccionada
                ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)]"
                }`}
            >
              {rateMeta(key).shortLabel}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <p className="rounded-2xl border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/5 px-4 py-3 text-sm text-[color:var(--warning)]">
          El historial no está disponible ahora mismo.
        </p>
      ) : puntos.length === 0 ? (
        <p className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--muted)]">
          Todavía no hay lecturas archivadas de {rateMeta(clave).label}.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
          {puntos.map((punto) => (
            <li
              key={`${punto.fecha}-${punto.momento}`}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{formatFecha(punto.fecha)}</span>
                <span className="text-xs text-[color:var(--muted)]">{MOMENTO_LABEL[punto.momento]}</span>
              </div>
              <p className="tabular text-lg font-semibold leading-none">
                {formatRate(punto.valor)}
                <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">Bs</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/"
        className="self-center text-sm font-medium text-[color:var(--muted)] underline underline-offset-2"
      >
        ← Volver a la calculadora
      </Link>
    </main>
  );
}
