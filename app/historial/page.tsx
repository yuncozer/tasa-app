import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Sparkline } from "@/components/Sparkline";
import { diaCaracasISO, formatFecha, formatPercent, formatRate } from "@/lib/format";
import {
  desplazarDia,
  diasDelRango,
  listarHistorico,
  listarHistoricoBrecha,
  listarHistoricoPesos,
  type Momento,
  type RangoHistorico,
} from "@/lib/historico";
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
 * Cuántos días enseña una página. Siete es la unidad con la que la gente
 * piensa el tiempo aquí —"la semana pasada"— y son catorce lecturas, que
 * caben en una pantalla de teléfono sin scroll infinito, que es justo lo que
 * había que arreglar: la lista crecía sin tope y con los días se volvía
 * impracticable.
 */
const DIAS_POR_PAGINA = 7;

/**
 * Techo de un tramo pedido a mano. No protege al servidor —la consulta ya
 * lleva su `limit`— sino a quien lee: más de un trimestre en una sola lista
 * es la pantalla que esto viene a evitar. Se recorta en silencio en vez de
 * rechazar, que para un parámetro de URL es lo cortés.
 */
const MAX_DIAS_RANGO = 92;

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `true` solo si es un día real: `2026-02-31` cumple el patrón y no existe. */
function fechaValida(valor: string | undefined): valor is string {
  if (!valor || !FECHA_ISO.test(valor)) return false;
  return new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor;
}

/**
 * El tramo que se va a mostrar, a partir de lo que venga en la URL.
 *
 * Devuelve también el `hoy` con el que se resolvió: lo necesitan los atajos y
 * el paso de página, y sacarlo de aquí evita leer el reloj dos veces —y en el
 * render, que el compilador de React no permite—.
 *
 * Con una sola fecha el tramo es **ese día**, que es lo que pide quien busca
 * "cómo estuvo el martes". Sin ninguna, la última semana. Al revés (`desde`
 * después de `hasta`) se intercambian en vez de devolver una lista vacía: es
 * un error de dedo, no una intención.
 */
function rangoDesdeQuery(desdeParam?: string, hastaParam?: string): { hoy: string; rango: RangoHistorico } {
  const hoy = diaCaracasISO(Date.now());
  const desde = fechaValida(desdeParam) ? desdeParam : undefined;
  const hasta = fechaValida(hastaParam) ? hastaParam : undefined;

  if (!desde && !hasta) {
    return { hoy, rango: { desde: desplazarDia(hoy, -(DIAS_POR_PAGINA - 1)), hasta: hoy } };
  }

  const a = desde ?? hasta!;
  const b = hasta ?? desde!;
  const rango = a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };

  // Se recorta por el extremo antiguo: lo reciente es lo que se mira.
  return {
    hoy,
    rango:
      diasDelRango(rango) > MAX_DIAS_RANGO
        ? { desde: desplazarDia(rango.hasta, -(MAX_DIAS_RANGO - 1)), hasta: rango.hasta }
        : rango,
  };
}

/** La URL de la propia página conservando vista y tasa, que no cambian al mover el tramo. */
function enlace(vista: Vista, clave: RateKey, rango?: RangoHistorico): string {
  const params = new URLSearchParams({ vista });
  if (vista === "bs") params.set("clave", clave);
  if (rango) {
    params.set("desde", rango.desde);
    params.set("hasta", rango.hasta);
  }
  return `/historial?${params.toString()}`;
}

/** El tramo de la misma longitud, movido hacia atrás o hacia adelante. */
function correr(rango: RangoHistorico, sentido: -1 | 1): RangoHistorico {
  const salto = diasDelRango(rango) * sentido;
  return { desde: desplazarDia(rango.desde, salto), hasta: desplazarDia(rango.hasta, salto) };
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
  searchParams: Promise<{ clave?: string; vista?: string; desde?: string; hasta?: string }>;
}) {
  const { clave: claveParam, vista: vistaParam, desde, hasta } = await searchParams;
  const vista = vistaValida(vistaParam);
  const clave = claveValida(claveParam);
  // `hoy` sale de la misma función que el tramo y no de un `Date.now()` aquí:
  // el compilador de React rechaza llamar a algo impuro dentro del render, y
  // además así los dos valores vienen del mismo instante.
  const { hoy, rango } = rangoDesdeQuery(desde, hasta);

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

      {/* Cambiar de vista conserva el tramo: es la misma pregunta mirada de otra
          manera, y perder las fechas obligaría a volver a elegirlas. */}
      <div className="flex gap-2">
        <Link href={enlace("bs", clave, rango)} className={claseTab(vista === "bs")}>
          En bolívares
        </Link>
        <Link href={enlace("cop", clave, rango)} className={claseTab(vista === "cop")}>
          En pesos
        </Link>
        <Link href={enlace("brecha", clave, rango)} className={claseTab(vista === "brecha")}>
          Brecha BCV/Binance
        </Link>
      </div>

      <Controles vista={vista} clave={clave} rango={rango} hoy={hoy} />

      {vista === "bs" ? (
        <HistorialBolivares clave={clave} rango={rango} />
      ) : vista === "cop" ? (
        <HistorialPesos rango={rango} />
      ) : (
        <HistorialBrecha rango={rango} />
      )}

      <Paso vista={vista} clave={clave} rango={rango} hoy={hoy} />

      <Link
        href="/"
        className="self-center text-sm font-medium text-[color:var(--muted)] underline underline-offset-2"
      >
        ← Volver a la calculadora
      </Link>
    </main>
  );
}

async function HistorialBolivares({ clave, rango }: { clave: RateKey; rango: RangoHistorico }) {
  let puntos: Awaited<ReturnType<typeof listarHistorico>> = [];
  let error = false;
  try {
    puntos = await listarHistorico(clave, undefined, rango);
  } catch {
    error = true;
  }

  return (
    <>
      <nav aria-label="Elegir tasa" className="flex flex-wrap gap-2">
        {CLAVES_HISTORIAL.map((key) => {
          const seleccionada = key === clave;
          return (
            <Link key={key} href={enlace("bs", key, rango)} className={claseTab(seleccionada)}>
              {rateMeta(key).shortLabel}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <AvisoError />
      ) : puntos.length === 0 ? (
        <AvisoVacio texto={`No hay lecturas de ${rateMeta(clave).label} en estas fechas.`} />
      ) : (
        <>
          {/* La serie llega de la más reciente a la más antigua, que es como se
              lee la lista; el gráfico necesita el orden contrario, porque el
              tiempo avanza hacia la derecha. */}
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
            <Sparkline
              valores={puntos.map((punto) => punto.valor).reverse()}
              etiqueta={rateMeta(clave).label}
              desde={puntos[puntos.length - 1].fecha}
              hasta={puntos[0].fecha}
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
async function HistorialPesos({ rango }: { rango: RangoHistorico }) {
  let filas: Awaited<ReturnType<typeof listarHistoricoPesos>> = [];
  let error = false;
  try {
    filas = await listarHistoricoPesos(undefined, rango);
  } catch {
    error = true;
  }

  if (error) return <AvisoError />;
  if (filas.length === 0) return <AvisoVacio texto="No hay lecturas en pesos en estas fechas." />;

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
async function HistorialBrecha({ rango }: { rango: RangoHistorico }) {
  let filas: Awaited<ReturnType<typeof listarHistoricoBrecha>> = [];
  let error = false;
  try {
    filas = await listarHistoricoBrecha(undefined, rango);
  } catch {
    error = true;
  }

  if (error) return <AvisoError />;
  if (filas.length === 0) return <AvisoVacio texto="No hay lecturas de la brecha en estas fechas." />;

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

/**
 * Los controles del tramo: atajos, fechas a mano y el tramo activo escrito en
 * palabras.
 *
 * Es un `<form method="GET">` de toda la vida, sin una línea de JavaScript:
 * la página ya se renderiza en el servidor y el navegador sabe montar una
 * query string él solo — mismo criterio que las pestañas y el `?actualizar=`
 * de la portada. Los `<input type="date">` abren el selector nativo del
 * teléfono, que es mejor que cualquier calendario propio y no pesa nada.
 *
 * `max={hoy}` porque no hay tasas del futuro que archivar; sin `min`, porque
 * saber desde cuándo hay datos costaría una consulta más para ahorrar un
 * error que la propia lista ya explica.
 */
function Controles({
  vista,
  clave,
  rango,
  hoy,
}: {
  vista: Vista;
  clave: RateKey;
  rango: RangoHistorico;
  hoy: string;
}) {
  const dias = diasDelRango(rango);
  const atajos = [
    { dias: DIAS_POR_PAGINA, texto: "7 días" },
    { dias: 30, texto: "30 días" },
  ];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {atajos.map((atajo) => {
          // Un atajo está activo solo si el tramo es exactamente el suyo y
          // termina hoy: si no, decir "7 días" sobre una semana de agosto
          // sería mentir sobre lo que se está viendo.
          const suyo = { desde: desplazarDia(hoy, -(atajo.dias - 1)), hasta: hoy };
          const activo = rango.desde === suyo.desde && rango.hasta === suyo.hasta;
          return (
            <Link key={atajo.dias} href={enlace(vista, clave, suyo)} className={claseTab(activo)}>
              {atajo.texto}
            </Link>
          );
        })}
        <p className="ml-auto text-xs text-[color:var(--muted)]">
          {dias === 1 ? formatFecha(rango.desde) : `${formatFecha(rango.desde)} — ${formatFecha(rango.hasta)}`}
        </p>
      </div>

      {/* En el teléfono cada campo se lleva su propia fila. Un
          `input type="date"` tiene un **ancho intrínseco mínimo** que impone el
          navegador —el texto de la fecha más su icono de calendario— y que no
          cede ante `width: 100%` ni ante la columna que lo contiene: en un
          iPhone real, con los dos en fila, el segundo se salía por el borde
          derecho de la tarjeta. A media fila el año se recortaba y a fila
          entera se desbordaba, así que lo que se les da es sitio de sobra.
          Desde `sm:` vuelven a la misma línea, donde sí caben. */}
      <form method="GET" action="/historial" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="vista" value={vista} />
        {vista === "bs" ? <input type="hidden" name="clave" value={clave} /> : null}

        <label className="flex min-w-0 flex-col gap-1 sm:flex-1">
          <span className="text-xs text-[color:var(--muted)]">Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={rango.desde}
            max={hoy}
            className="tabular w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1 sm:flex-1">
          <span className="text-xs text-[color:var(--muted)]">Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={rango.hasta}
            max={hoy}
            className="tabular w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[color:var(--foreground)] outline-none"
          />
        </label>

        <button
          type="submit"
          className="w-full shrink-0 rounded-xl border border-[color:var(--accent)] bg-[color:var(--accent)]/15 px-4 py-2 text-sm font-semibold text-[color:var(--accent)] transition active:scale-95 sm:w-auto"
        >
          Ver
        </button>
      </form>

      <p className="text-xs text-[color:var(--muted)]">
        Deja una de las dos fechas en blanco para ver un solo día.
      </p>
    </section>
  );
}

/**
 * Pasar de página es mover el tramo, no pedir la fila siguiente: ver la
 * sección de `RangoHistorico` en `lib/historico.ts`. El salto es del tamaño
 * del propio tramo, así que con la semana por defecto se avanza semana a
 * semana y con un tramo elegido a mano, del mismo largo que se eligió.
 */
function Paso({
  vista,
  clave,
  rango,
  hoy,
}: {
  vista: Vista;
  clave: RateKey;
  rango: RangoHistorico;
  hoy: string;
}) {
  const anterior = correr(rango, -1);
  const siguiente = correr(rango, 1);
  // Sin datos del futuro, adelantar más allá de hoy no lleva a ninguna parte:
  // el botón no se pinta en vez de ofrecer una pantalla vacía.
  const hayFuturo = rango.hasta < hoy;

  return (
    <nav aria-label="Cambiar de fechas" className="flex items-center justify-between gap-2">
      <Link
        href={enlace(vista, clave, anterior)}
        className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-1.5 text-sm font-medium text-[color:var(--muted)] transition active:scale-95"
      >
        ← Antes
      </Link>
      {hayFuturo ? (
        <Link
          href={enlace(vista, clave, { desde: siguiente.desde, hasta: siguiente.hasta > hoy ? hoy : siguiente.hasta })}
          className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-1.5 text-sm font-medium text-[color:var(--muted)] transition active:scale-95"
        >
          Después →
        </Link>
      ) : (
        <span className="text-xs text-[color:var(--muted)]">Al día</span>
      )}
    </nav>
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
