import { ImageResponse } from "next/og";
import { techoDeImagenes } from "@/lib/og-limite";
import type { NextRequest } from "next/server";
import { formatClock, formatDate, formatFechaCorta, formatRate } from "@/lib/format";
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
import { buildFilasPesos, type FilaPesosId } from "@/lib/pesos";
import { snapshotDelDia } from "@/lib/snapshot-hoy";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Imagen del post diario en **pesos**: la misma plantilla que
 * `app/api/og/instagram-post`, con las tasas vistas desde el lado colombiano de
 * la frontera. Igual que aquella, va sin autenticación porque Instagram
 * descarga la URL por su cuenta (`image_url` de la Graph API), y por el mismo
 * motivo lee `snapshotDelDia()` en vez de `getRates()`: esta ruta también
 * sirve la vista previa de `/hoy`, pedida en cualquier momento después de
 * publicar.
 *
 * `?proporcion=9:16` sirve la Historia automática que se publica junto a esta
 * diapositiva (ver `lib/publish-hoy.ts`). Mismo patrón que
 * `app/api/og/instagram-post`: título nuevo, header encogido, sin firma HMAC
 * por el mismo motivo que ya tiene esta ruta.
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
  tituloMarginTop: number;
  cuerpoMarginTop: number;
  cuerpoGap: number;
}

const MEDIDAS: Record<Proporcion, Medidas> = {
  "1:1": { padding: 56, reservaArriba: 0, reservaAbajo: 0, gapFilas: 20, tituloMarginTop: 0, cuerpoMarginTop: 0, cuerpoGap: 0 },
  "9:16": { padding: 56, reservaArriba: 110, reservaAbajo: 130, gapFilas: 28, tituloMarginTop: 140, cuerpoMarginTop: 42, cuerpoGap: 40 },
};

const BANDERA_POR_FILA: Record<FilaPesosId, string> = {
  TRM: "Flag-of-US.svg",
  FRONTERA_BUY: "Flag-of-US.svg",
  FRONTERA_SELL: "Flag-of-US.svg",
  VES_PROMEDIO: "Flag-of-Venezuela.svg",
};

const ORDEN: FilaPesosId[] = ["TRM", "FRONTERA_BUY", "FRONTERA_SELL", "VES_PROMEDIO"];

function proporcionDesdeQuery(request: NextRequest): Proporcion {
  return request.nextUrl.searchParams.get("proporcion") === "9:16" ? "9:16" : "1:1";
}

function PostImage({
  snapshot,
  proporcion,
  banderas,
  banderaCo,
  icons,
}: {
  snapshot: RatesSnapshot;
  proporcion: Proporcion;
  banderas: Record<FilaPesosId, string>;
  banderaCo: string;
  icons: { instagram: string; browser: string };
}) {
  const medidas = MEDIDAS[proporcion];
  const esHistoria = proporcion === "9:16";

  const header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: esHistoria ? "flex-end" : "flex-start",
        paddingLeft: AIRE_LATERAL,
        paddingRight: AIRE_LATERAL,
      }}
    >
      <Encabezado subtitulo="Cuánto vale tu dinero hoy en pesos" escala={esHistoria ? 0.9 : 1} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
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
      {buildFilasPesos(snapshot).map((fila) => (
        <FilaMoneda
          key={fila.id}
          banderaSrc={banderas[fila.id]}
          label={fila.label}
          fuente={fila.fuente}
          valor={fila.copPerUnit === null ? "No disponible" : `${formatRate(fila.copPerUnit)} COP`}
          noDisponible={fila.copPerUnit === null}
        />
      ))}
    </div>
  );

  // Satori no soporta fragmentos (`<>…</>`): un fragmento ahí rompe el árbol
  // de layout de Yoga y descuadra el ancho de los hermanos siguientes —así se
  // desbordaban las tarjetas de tasa en el 1:1 antes de este cambio. Por eso
  // el 1:1 inserta `header` y `filas` como dos hijos sueltos (con `&&`) en
  // vez de agruparlos, igual de "hijos directos" que en la versión original.
  const cuerpoHistoria = esHistoria && (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "center", marginTop: medidas.tituloMarginTop }}>
        <TituloHistoria fecha={formatFechaCorta(snapshot.fetchedAt)} moneda="Pesos" banderaSrc={banderaCo} />
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

  const [snapshot, geistRegular, geistBold, instagramIcon, browserIcon, banderaCo, ...banderasSvg] = await Promise.all([
    snapshotDelDia(),
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    leerSvgComoDataUri("instagram-icon.svg"),
    leerSvgComoDataUri("browser-icon.svg"),
    leerSvgComoDataUri("Flag-of-Colombia.svg"),
    ...ORDEN.map((id) => leerSvgComoDataUri(BANDERA_POR_FILA[id])),
  ]);

  const banderas = Object.fromEntries(ORDEN.map((id, i) => [id, banderasSvg[i]])) as Record<FilaPesosId, string>;

  return new ImageResponse(
    <PostImage
      snapshot={snapshot}
      proporcion={proporcion}
      banderas={banderas}
      banderaCo={banderaCo}
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
