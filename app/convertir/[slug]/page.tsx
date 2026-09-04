import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { SocialCTA } from "@/components/SocialCTA";
import {
  filasDe,
  formatoDe,
  inversaDe,
  montosHermanos,
  nombreMoneda,
  nombreMonto,
  parseSlug,
  slugDe,
  type Conversion,
  type FilaConversion,
  type MonedaSeo,
} from "@/lib/conversiones-seo";
import { formatAmount, formatRate, formatRelative } from "@/lib/format";
import { getRates } from "@/lib/rates";
import { sitioPublico } from "@/lib/sitio";
import type { RateKey } from "@/lib/types";

/**
 * La respuesta a "cuánto son 100 dólares en bolívares hoy", en su propia URL.
 *
 * Es la única parte de la app pensada para llegar desde un buscador, y eso
 * cambia dos cosas respecto de la portada:
 *
 * - **Tiene que responder antes de que el lector haga nada.** La portada abre
 *   una calculadora vacía; aquí el monto ya viene en la URL, así que lo
 *   primero que se ve es el resultado. Lo demás —las otras tasas, el detalle
 *   del cálculo— va debajo.
 * - **Tiene que ser una página de verdad, no un cebo.** Setenta y dos páginas
 *   que solo repiten un número son justo lo que un buscador castiga, y con
 *   razón: no le sirven a nadie. Cada una lleva el abanico completo de tasas
 *   que responden esa pregunta, de dónde sale cada una, cuándo se consultó, la
 *   cuenta al revés y los montos vecinos.
 *
 * El destino real sigue siendo la calculadora: quien busca 100 casi siempre
 * necesita después otro monto, y eso no lo resuelve una página estática. De
 * ahí que el enlace a la portada esté arriba y abajo, y no escondido.
 */

/**
 * Se renderiza en cada petición, como la portada, y **no se prerenderiza**.
 *
 * Aquí hubo un `generateStaticParams()` con las 72 rutas, que es lo que uno
 * escribe por reflejo cuando la lista de páginas es finita y conocida. Estaba
 * mal, y en producción se vio enseguida: Next las prerenderizó en el build, así
 * que lo que servía a la gente eran las tasas del instante en que compiló
 * Vercel. Binance falló durante ese build y las dos filas de Binance decían
 * "Tasa no disponible" mientras `/api/rates` tenía 980 y 965.
 *
 * El daño potencial es peor que esa fila vacía: por el mismo camino la página
 * podría haber servido un **número** viejo como si fuera el de hoy, que es lo
 * único que esta app tiene prohibido hacer. Una página que dice "hoy" en el
 * titular no puede salir de un artefacto de compilación.
 *
 * Quien evita golpear a los proveedores no es el prerender sino la cabecera
 * de CDN de `next.config.ts` (`s-maxage=60`), exactamente igual que en la
 * portada, más los cinco minutos de `lib/cache.ts`.
 *
 * `todasLasConversiones()` sigue existiendo para el sitemap, que sí quiere la
 * lista completa; lo que ya no hace falta es dársela a Next.
 */
export const dynamic = "force-dynamic";

/**
 * La tasa con la que se compone la vista previa de una moneda.
 *
 * La imagen habla el vocabulario de la app —una `RateKey`— y el slug habla el
 * del lector —una moneda, que puede tener varios precios—. Se elige la primera
 * de cada moneda, que es la más citada y la misma que encabeza la página.
 */
function claveOg(origen: MonedaSeo): RateKey {
  if (origen === "euros") return "EUR_BCV";
  if (origen === "pesos") return "COP_OFICIAL";
  if (origen === "bolivares") return "VES";
  return "USD_BCV";
}

function pregunta({ monto, origen, destino }: Conversion): string {
  // El "hoy" no es relleno: es la palabra con la que se busca esto, y la que
  // dice que el número de arriba es de ahora y no una tabla vieja. El verbo
  // concuerda con el monto porque "¿Cuánto son 1 dólar?" es justo el detalle
  // que hace que una página se lea como generada por una máquina.
  const verbo = monto === 1 ? "es" : "son";
  return `¿Cuánto ${verbo} ${nombreMonto(monto, origen)} en ${nombreMoneda(destino)} hoy?`;
}

/**
 * La letra pequeña de una fila: la tasa con la que se hizo esa cuenta.
 *
 * No siempre es la de origen. Cuando se parte de bolívares, la tasa de partida
 * es 1 por construcción y repetir "1 bolívar = 1,00 Bs" en cada fila no dice
 * nada — lo que distingue una fila de otra es la tasa de llegada. Y cuando
 * ninguno de los dos lados es el bolívar, hacen falta las dos para que la
 * cuenta se pueda rehacer a mano.
 */
function detalleTasa(fila: FilaConversion, origen: MonedaSeo, destino: MonedaSeo): string {
  const deOrigen = `1 ${nombreMoneda(origen, 1)} = ${formatRate(fila.tasaOrigen)} Bs`;
  const deDestino = `1 ${nombreMoneda(destino, 1)} = ${formatRate(fila.tasaDestino)} Bs`;

  if (fila.tasaOrigen === null || fila.tasaDestino === null) return "Tasa no disponible";
  if (origen === "bolivares") return deDestino;
  if (destino === "bolivares") return deOrigen;
  return `${deOrigen} · ${deDestino}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const conversion = parseSlug(slug);
  if (!conversion) return { title: "Conversión no encontrada — La Tasa" };

  const { monto, origen, destino } = conversion;
  const titulo = `${nombreMonto(monto, origen)} en ${nombreMoneda(destino)} hoy`;

  return {
    title: `${titulo} — La Tasa`,
    description:
      `Cuánto son ${nombreMonto(monto, origen)} en ${nombreMoneda(destino)} hoy, ` +
      `con las tasas del BCV, de Binance P2P y del peso colombiano. ` +
      `Actualizado varias veces al día.`,
    // Canónica absoluta: la misma página se alcanza desde enlaces con y sin
    // barra final, y sin esto un buscador puede tratarlas como dos.
    alternates: { canonical: `${sitioPublico()}/convertir/${slug}` },
    openGraph: {
      title: `${titulo} — La Tasa`,
      description: `La conversión de hoy, con las tasas del BCV y de Binance P2P.`,
      url: `${sitioPublico()}/convertir/${slug}`,
      type: "website",
      // La vista previa **es** la conversión, no una tarjeta genérica. Es la
      // pieza que más lejos llega: cuando alguien pega este enlace en un chat,
      // los que lo ven leen la cifra sin abrir nada. Mismo criterio que la
      // imagen propia de `/hoy`, y por eso se compone con la misma plantilla
      // que usa el botón de compartir — lo que se ve al compartir es lo mismo
      // se comparta como se comparta.
      images: [
        {
          url: `${sitioPublico()}/api/og/conversion?monto=${monto}&origen=${claveOg(origen)}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function PaginaConversion({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const conversion = parseSlug(slug);
  if (!conversion) notFound();

  const snapshot = await getRates();
  const filas = filasDe(conversion, snapshot);
  const { origen, destino } = conversion;
  const formatoDestino = formatoDe(destino);

  // La primera fila es la respuesta grande. El orden de `COMBOS` no es
  // casual: la tasa más citada de cada par va primera.
  const principal = filas[0];
  const inversa = inversaDe(conversion);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <Logo className="h-9 w-9 shrink-0 text-[color:var(--accent)]" />
          <span className="text-2xl font-bold leading-none tracking-tight">
            La <span className="text-[color:var(--accent)]">Tasa</span>
          </span>
        </Link>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4">
        <h1 className="text-xl font-semibold leading-tight">{pregunta(conversion)}</h1>

        <p className="text-3xl font-bold tabular text-[color:var(--accent)]">
          {formatAmount(principal.valor, formatoDestino)}{" "}
          <span className="text-lg font-semibold text-[color:var(--foreground)]">
            {nombreMoneda(destino)}
          </span>
        </p>

        <p className="text-sm text-[color:var(--muted)]">
          {principal.valor === null
            ? `La tasa ${principal.etiquetaOrigen} no está disponible ahora mismo.`
            : `Según ${principal.etiquetaOrigen}${filas.length > 1 ? ". Abajo están las demás tasas que responden esta pregunta." : "."}`}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">
          Con cada tasa
        </h2>

        <ul className="flex flex-col gap-2">
          {filas.map((fila) => (
            <li
              key={`${fila.origen}-${fila.destino}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                {/* Sin `truncate`, al contrario que `RateCard`: allí la etiqueta
                    acompaña a un número que manda, y aquí *es* el contenido —"Dólar
                    Binance (compra) → Pes…" deja al lector sin saber a qué peso se
                    refiere, que es justo lo que la página vino a responder. */}
                <span className="text-sm font-medium">
                  {fila.origen === fila.destino
                    ? fila.etiquetaOrigen
                    : `${fila.etiquetaOrigen} → ${fila.etiquetaDestino}`}
                </span>
                <span className="text-xs text-[color:var(--muted)]">
                  {detalleTasa(fila, origen, destino)}
                </span>
              </div>

              <span className="shrink-0 text-right text-lg font-semibold tabular">
                {formatAmount(fila.valor, formatoDestino)}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs leading-relaxed text-[color:var(--muted)]">
          Todas las conversiones cruzan por el bolívar: el monto se pasa a bolívares con la
          tasa de origen y de ahí a la moneda de destino. Es la misma cuenta que hace la
          calculadora, con los mismos números.
        </p>
      </section>

      <Link
        href="/"
        className="rounded-2xl border border-[color:var(--accent)] bg-[color:var(--accent)]/15 px-4 py-3 text-center text-base font-semibold text-[color:var(--accent)] transition active:scale-95"
      >
        Convertir otro monto en la calculadora
      </Link>

      {/*
        El canal va **después** del botón a la calculadora y no antes: quien
        llega de un buscador viene a por una cifra, y pedirle que siga una
        cuenta antes de dársela es la forma más rápida de perderlo. Aquí ya
        obtuvo lo que buscaba y tiene sentido ofrecerle recibirlo cada día —
        que es, además, lo único que convierte una visita de paso en alguien
        que vuelve. Sin esto la página captaba la visita y no capturaba nada.
      */}
      <SocialCTA />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">
          Otros montos
        </h2>

        <div className="flex flex-wrap gap-2">
          {montosHermanos(conversion).map((otra) => (
            <Link
              key={slugDe(otra)}
              href={`/convertir/${slugDe(otra)}`}
              className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm tabular text-[color:var(--muted)]"
            >
              {nombreMonto(otra.monto, otra.origen)}
            </Link>
          ))}
        </div>

        {inversa && (
          <Link
            href={`/convertir/${slugDe(inversa)}`}
            className="text-sm font-medium text-[color:var(--muted)] underline underline-offset-2"
          >
            Al revés: {nombreMonto(inversa.monto, inversa.origen)} en {nombreMoneda(inversa.destino)} →
          </Link>
        )}

        <Link
          href="/historial"
          className="text-sm font-medium text-[color:var(--muted)] underline underline-offset-2"
        >
          Cómo se movió esta tasa los últimos días →
        </Link>
      </section>

      <p className="text-center text-xs text-[color:var(--muted)]">
        Tasas consultadas {formatRelative(snapshot.fetchedAt)}
      </p>

      <Footer fetchedAt={snapshot.fetchedAt} />
    </main>
  );
}
