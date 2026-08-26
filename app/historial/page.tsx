import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Sparkline } from "@/components/Sparkline";
import { formatFecha, formatPercent, formatRate } from "@/lib/format";
import { listarHistorico, listarHistoricoBrecha, listarHistoricoPesos, type Momento } from "@/lib/historico";
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

type Vista = "bs" | "cop" | "brecha";

function vistaValida(valor: string | undefined): Vista {
  if (valor === "cop" || valor === "brecha") return valor;
  return "bs";
}

function claseTab(seleccionada: boolean): string {
  return `rounded-full border px-4 py-1.5 text-sm font-medium transition active:scale-95 ${seleccionada
    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
    : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)]"
    }`;
}

/**
 * Historial de las lecturas que el cron de tasas archiva dos veces al día
 * (9:00 am y 6:00 pm en Caracas, ver `lib/historico.ts`). Responde lo que el
 * panel de "hoy" no puede: cómo estuvo una tasa en un momento concreto de un
 * día pasado — "¿cómo estuvo el Binance venta antier a las 6:00 pm?".
 *
 * Dos vistas, igual que el carrusel diario que se publica en Instagram: en
 * bolívares (una tasa a la vez, la que se elige arriba) y en pesos (las
 * cuatro filas del post juntas, porque así es como salen publicadas — verlas
 * sueltas rompería la comparación que esa diapositiva propone). La vista y la
 * tasa elegida viajan por query string (`?vista=` y `?clave=`), no por estado
 * de cliente: mismo criterio que el botón "Actualizar tasas" de la portada,
 * la página ya se renderiza en el servidor y un enlace normal resuelve el
 * caso sin JavaScript de por medio.
 */
export default async function Historial({
  searchParams,
}: {
  searchParams: Promise<{ clave?: string; vista?: string }>;
}) {
  const { clave: claveParam, vista: vistaParam } = await searchParams;
  const vista = vistaValida(vistaParam);
  const clave = claveValida(claveParam);

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

      <div className="flex gap-2">
        <Link href="/historial?vista=bs" className={claseTab(vista === "bs")}>
          En bolívares
        </Link>
        <Link href="/historial?vista=cop" className={claseTab(vista === "cop")}>
          En pesos
        </Link>
        <Link href="/historial?vista=brecha" className={claseTab(vista === "brecha")}>
          Brecha BCV/Binance
        </Link>
      </div>

      {vista === "bs" ? (
        <HistorialBolivares clave={clave} />
      ) : vista === "cop" ? (
        <HistorialPesos />
      ) : (
        <HistorialBrecha />
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

async function HistorialBolivares({ clave }: { clave: RateKey }) {
  let puntos: Awaited<ReturnType<typeof listarHistorico>> = [];
  let error = false;
  try {
    puntos = await listarHistorico(clave);
  } catch {
    error = true;
  }

  return (
    <>
      <nav aria-label="Elegir tasa" className="flex flex-wrap gap-2">
        {CLAVES_HISTORIAL.map((key) => {
          const seleccionada = key === clave;
          return (
            <Link key={key} href={`/historial?vista=bs&clave=${key}`} className={claseTab(seleccionada)}>
              {rateMeta(key).shortLabel}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <AvisoError />
      ) : puntos.length === 0 ? (
        <AvisoVacio texto={`Todavía no hay lecturas archivadas de ${rateMeta(clave).label}.`} />
      ) : (
        <>
          {/* La serie llega de la más reciente a la más antigua, que es como se
              lee la lista; el gráfico necesita el orden contrario, porque el
              tiempo avanza hacia la derecha. */}
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
            <Sparkline
              valores={puntos.map((punto) => punto.valor).reverse()}
              etiqueta={rateMeta(clave).label}
            />
          </div>

          <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
            {puntos.map((punto) => (
              <li
                key={`${punto.fecha}-${punto.momento}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{formatFecha(punto.fecha)}</span>
                  <span className="text-xs text-[color:var(--muted)]">
                    {MOMENTO_LABEL[punto.momento]}
                  </span>
                </div>
                <p className="tabular text-lg font-semibold leading-none">
                  {formatRate(punto.valor)}
                  <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">Bs</span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * La vista en pesos: las cuatro filas de `lib/pesos.ts` (la diapositiva que
 * se publica) para cada momento archivado, en vez de una tasa suelta — no hay
 * selector de clave porque no hay nada que elegir, siempre son las mismas
 * cuatro.
 */
async function HistorialPesos() {
  let filas: Awaited<ReturnType<typeof listarHistoricoPesos>> = [];
  let error = false;
  try {
    filas = await listarHistoricoPesos();
  } catch {
    error = true;
  }

  if (error) return <AvisoError />;
  if (filas.length === 0) return <AvisoVacio texto="Todavía no hay lecturas archivadas en pesos." />;

  return (
    <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
      {filas.map((fila) => (
        <li key={`${fila.fecha}-${fila.momento}`} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">{formatFecha(fila.fecha)}</span>
            <span className="text-xs text-[color:var(--muted)]">{MOMENTO_LABEL[fila.momento]}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <ValorPesos label="Dólar TRM" valor={fila.trm} />
            <ValorPesos label="Bolívar (promedio)" valor={fila.vesPromedio} />
            <ValorPesos label="Binance (compra)" valor={fila.fronteraBuy} />
            <ValorPesos label="Binance (venta)" valor={fila.fronteraSell} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * La brecha entre el dólar BCV y la venta de Binance, para cada momento
 * archivado — la misma cuenta que la franja de la portada y la tarjeta del
 * reporte semanal (`calcularBrecha()` en `lib/brecha.ts`), sobre lo ya
 * archivado en vez del snapshot de hoy.
 *
 * Sin sparkline a propósito: `Sparkline` da por hecho una serie en bolívares
 * en su etiqueta de accesibilidad, y una brecha es un porcentaje — reusarla
 * diría "bolívares" sobre una cifra que no lo es.
 */
async function HistorialBrecha() {
  let filas: Awaited<ReturnType<typeof listarHistoricoBrecha>> = [];
  let error = false;
  try {
    filas = await listarHistoricoBrecha();
  } catch {
    error = true;
  }

  if (error) return <AvisoError />;
  if (filas.length === 0) return <AvisoVacio texto="Todavía no hay lecturas archivadas de la brecha." />;

  return (
    <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
      {filas.map((fila) => (
        <li
          key={`${fila.fecha}-${fila.momento}`}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium">{formatFecha(fila.fecha)}</span>
            <span className="text-xs text-[color:var(--muted)]">{MOMENTO_LABEL[fila.momento]}</span>
          </div>
          {fila.brecha === null ? (
            <p className="text-sm text-[color:var(--warning)]">Sin dato</p>
          ) : (
            <p className="tabular text-lg font-semibold leading-none">{formatPercent(fila.brecha)}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ValorPesos({ label, valor }: { label: string; valor: number | null }) {
  return (
    <div>
      <p className="text-xs text-[color:var(--muted)]">{label}</p>
      <p className="tabular text-sm font-semibold leading-tight">
        {formatRate(valor)} <span className="text-xs font-normal text-[color:var(--muted)]">COP</span>
      </p>
    </div>
  );
}

function AvisoError() {
  return (
    <p className="rounded-2xl border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/5 px-4 py-3 text-sm text-[color:var(--warning)]">
      El historial no está disponible ahora mismo.
    </p>
  );
}

function AvisoVacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--muted)]">
      {texto}
    </p>
  );
}
