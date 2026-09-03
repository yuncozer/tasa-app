import { ImageResponse } from "next/og";
import { techoDeImagenes } from "@/lib/og-limite";
import type { NextRequest } from "next/server";
import { formatClock, formatDate, formatFechaCorta, formatRate, vigenciaBcv } from "@/lib/format";
import {
  AIRE_LATERAL,
  AVISO_TASAS,
  COLOR,
  Encabezado,
  FilaMoneda,
  Pie,
  TituloHistoria,
  leerFontBuffer,
  leerSvgComoDataUri,
} from "@/lib/og-shared";
import { snapshotDelDia } from "@/lib/snapshot-hoy";
import type { Rate, RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Imagen del post diario de Instagram: mismo layout que el mockup de
 * referencia, pero renderizado en código (no una captura con parches) para
 * que los montos y la fecha salgan siempre correctos. Instagram la busca
 * como una URL pública normal (`image_url` de la Graph API), así que esta
 * ruta va sin autenticación, a diferencia del cron que la dispara.
 *
 * Esta misma URL sirve dos peticiones distintas: la de Meta al publicar, y la
 * de `/hoy` cada vez que alguien abre esa vista previa después. Por eso el
 * snapshot sale de `snapshotDelDia()` (el que el cron congeló al publicar) y
 * no de `getRates()` en vivo: si el dólar Binance se mueve entre medias, la
 * imagen tiene que seguir diciendo lo mismo que el caption ya publicado.
 *
 * `?proporcion=9:16` sirve el mismo contenido recortado para la Historia
 * automática que se publica junto al carrusel (ver `lib/publish-hoy.ts`).
 * Mismo patrón que `instagram-semanal`: el lienzo vertical reserva aire
 * arriba y abajo (`reservaArriba`/`reservaAbajo`) porque Instagram superpone
 * su propia interfaz ahí en una Story, y sin firma HMAC por el mismo motivo
 * que ya tiene esta ruta — no recibe texto libre, solo un valor de un
 * conjunto cerrado.
 */
export const runtime = "nodejs";

type Proporcion = "1:1" | "9:16";

const SIZE: Record<Proporcion, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

interface Medidas {
  padding: number;
  reservaArriba: number;
  reservaAbajo: number;
  gapFilas: number;
  /** Aire desde la reserva superior hasta el título de la Historia. Solo lo usa 9:16. */
  tituloMarginTop: number;
  /** Aire entre el título y el header (logo + hora). Solo lo usa 9:16. */
  cuerpoMarginTop: number;
  /** Entre el header y la primera tarjeta de tasa. Solo lo usa 9:16. */
  cuerpoGap: number;
}

const MEDIDAS: Record<Proporcion, Medidas> = {
  "1:1": { padding: 56, reservaArriba: 0, reservaAbajo: 0, gapFilas: 20, tituloMarginTop: 0, cuerpoMarginTop: 0, cuerpoGap: 0 },
  "9:16": { padding: 56, reservaArriba: 110, reservaAbajo: 130, gapFilas: 28, tituloMarginTop: 140, cuerpoMarginTop: 42, cuerpoGap: 40 },
};

const FILAS: RateKey[] = ["USD_BCV", "USD_BINANCE_BUY", "USD_BINANCE_SELL", "EUR_BCV", "COP_FRONTERA"];

const BANDERA_POR_TASA: Partial<Record<RateKey, string>> = {
  USD_BCV: "Flag-of-US.svg",
  USD_BINANCE_BUY: "Flag-of-US.svg",
  USD_BINANCE_SELL: "Flag-of-US.svg",
  EUR_BCV: "Flag-of-European-Union.svg",
  COP_FRONTERA: "Flag-of-Colombia.svg",
};

function FilaTasa({ rate, banderaSrc }: { rate: Rate; banderaSrc: string }) {
  const noDisponible = rate.bsPerUnit === null;
  const esBcv = rate.key === "USD_BCV" || rate.key === "EUR_BCV";
  const vigencia = esBcv ? vigenciaBcv(rate.updatedAt) : undefined;

  return (
    <FilaMoneda
      banderaSrc={banderaSrc}
      label={rate.label}
      sublabel={vigencia ? `(${vigencia})` : undefined}
      // Solo el peso frontera necesita declarar de dónde sale: las demás filas
      // llevan la fuente en el propio nombre. Sin esto, "Peso frontera" se lee
      // como si viniera de las casas de cambio de Cúcuta, y es una
      // aproximación construida sobre el mercado P2P de Binance.
      fuente={rate.key === "COP_FRONTERA" ? rate.source : undefined}
      valor={noDisponible ? "No disponible" : `${formatRate(rate.bsPerUnit)} Bs`}
      noDisponible={noDisponible}
    />
  );
}

function proporcionDesdeQuery(request: NextRequest): Proporcion {
  return request.nextUrl.searchParams.get("proporcion") === "9:16" ? "9:16" : "1:1";
}

function PostImage({
  snapshot,
  proporcion,
  banderas,
  banderaVe,
  icons,
}: {
  snapshot: RatesSnapshot;
  proporcion: Proporcion;
  banderas: Record<string, string>;
  banderaVe: string;
  icons: { instagram: string; browser: string };
}) {
  const medidas = MEDIDAS[proporcion];
  const esHistoria = proporcion === "9:16";

  const header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        // Bottoms alineados en la Historia: el bloque del logo (dos líneas) y
        // la hora (una) quedan a la misma distancia de la primera tasa, en
        // vez de que la hora —más corta— le saque aire de más.
        alignItems: esHistoria ? "flex-end" : "flex-start",
        paddingLeft: AIRE_LATERAL,
        paddingRight: AIRE_LATERAL,
      }}
    >
      <Encabezado subtitulo="Cuánto vale tu dinero hoy" escala={esHistoria ? 0.9 : 1} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {/* En la Historia el título ya dice la fecha: aquí solo queda la hora. */}
        {!esHistoria && (
          <span style={{ fontSize: 32, color: COLOR.foreground, fontWeight: 700 }}>
            {formatDate(snapshot.fetchedAt)}
          </span>
        )}
        <span style={{ fontSize: 32, color: COLOR.foreground, fontWeight: 700 }}>
          {formatClock(snapshot.fetchedAt)}
        </span>
      </div>
    </div>
  );

  const filas = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: medidas.gapFilas,
        paddingLeft: AIRE_LATERAL,
        paddingRight: AIRE_LATERAL,
      }}
    >
      {FILAS.map((key) => (
        <FilaTasa key={key} rate={snapshot.rates[key]} banderaSrc={banderas[key]} />
      ))}
    </div>
  );

  // Satori no soporta fragmentos (`<>…</>`): un fragmento ahí rompe el árbol
  // de layout de Yoga y descuadra el ancho de los hermanos siguientes —así se
  // desbordaban las tarjetas de tasa en el 1:1 antes de este cambio. Por eso
  // el 1:1 inserta `header` y `filas` como dos hijos sueltos (con `&&`) en
  // vez de agruparlos, y son igual de "hijos directos" del contenedor de
  // abajo que en la versión sin Historia original.
  const cuerpoHistoria = esHistoria && (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "center", marginTop: medidas.tituloMarginTop }}>
        <TituloHistoria fecha={formatFechaCorta(snapshot.fetchedAt)} moneda="Bs" banderaSrc={banderaVe} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: medidas.cuerpoGap, marginTop: medidas.cuerpoMarginTop }}>
        {header}
        {filas}
      </div>
    </div>
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        // "space-between" reparte el aire sobrante entre los bloques de
        // arriba abajo. En el 1:1 son tres hijos (header, filas, pie): el
        // mismo reparto de siempre. En la Historia son solo dos (el grupo
        // título+cuerpo, y el pie), para que el pie quede pegado al fondo sin
        // que ese reparto también separe el título del cuerpo — esa distancia
        // ya la fijan `tituloMarginTop`/`cuerpoMarginTop` a propósito.
        justifyContent: "space-between",
        backgroundColor: COLOR.background,
        paddingLeft: medidas.padding,
        paddingRight: medidas.padding,
        paddingTop: medidas.padding + medidas.reservaArriba,
        paddingBottom: medidas.padding + medidas.reservaAbajo,
        fontFamily: "Geist",
      }}
    >
      {esHistoria ? cuerpoHistoria : header}
      {!esHistoria && filas}

      <div style={{ display: "flex" }}>
        <Pie icons={icons} aviso={AVISO_TASAS} />
      </div>
    </div>
  );
}

export async function GET(request: NextRequest) {
  const techo = techoDeImagenes(request);
  if (techo) return techo;

  const proporcion = proporcionDesdeQuery(request);

  const [snapshot, geistRegular, geistBold, instagramIcon, browserIcon, banderaVe, ...banderasSvg] = await Promise.all([
    snapshotDelDia(),
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    leerSvgComoDataUri("instagram-icon.svg"),
    leerSvgComoDataUri("browser-icon.svg"),
    leerSvgComoDataUri("Flag-of-Venezuela.svg"),
    ...FILAS.map((key) => leerSvgComoDataUri(BANDERA_POR_TASA[key]!)),
  ]);

  const banderas = Object.fromEntries(FILAS.map((key, i) => [key, banderasSvg[i]]));

  return new ImageResponse(
    <PostImage
      snapshot={snapshot}
      proporcion={proporcion}
      banderas={banderas}
      banderaVe={banderaVe}
      icons={{ instagram: instagramIcon, browser: browserIcon }}
    />,
    {
      ...SIZE[proporcion],
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );
}
