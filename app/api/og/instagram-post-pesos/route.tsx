import { ImageResponse } from "next/og";
import { formatClock, formatDate, formatRate } from "@/lib/format";
import { AIRE_LATERAL, AVISO_TASAS, COLOR, Encabezado, FilaMoneda, Pie, leerFontBuffer, leerSvgComoDataUri } from "@/lib/og-shared";
import { buildFilasPesos, type FilaPesosId } from "@/lib/pesos";
import { getRates } from "@/lib/rates";
import type { RatesSnapshot } from "@/lib/types";

/**
 * Imagen del post diario en **pesos**: la misma plantilla que
 * `app/api/og/instagram-post`, con las tasas vistas desde el lado colombiano de
 * la frontera. Igual que aquella, va sin autenticación porque Instagram
 * descarga la URL por su cuenta (`image_url` de la Graph API).
 */
export const runtime = "nodejs";

const SIZE = { width: 1080, height: 1080 };

const BANDERA_POR_FILA: Record<FilaPesosId, string> = {
  TRM: "Flag-of-US.svg",
  FRONTERA_BUY: "Flag-of-US.svg",
  FRONTERA_SELL: "Flag-of-US.svg",
  VES_PROMEDIO: "Flag-of-Venezuela.svg",
};

const ORDEN: FilaPesosId[] = ["TRM", "FRONTERA_BUY", "FRONTERA_SELL", "VES_PROMEDIO"];

function PostImage({
  snapshot,
  banderas,
  icons,
}: {
  snapshot: RatesSnapshot;
  banderas: Record<FilaPesosId, string>;
  icons: { instagram: string; browser: string };
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: COLOR.background,
        padding: 56,
        fontFamily: "Geist",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          paddingLeft: AIRE_LATERAL,
          paddingRight: AIRE_LATERAL,
        }}
      >
        <Encabezado subtitulo="Cuánto vale tu dinero hoy en pesos" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ fontSize: 32, color: COLOR.foreground, fontWeight: 700 }}>
            {formatDate(snapshot.fetchedAt)}
          </span>
          <span style={{ fontSize: 32, color: COLOR.foreground, fontWeight: 700 }}>
            {formatClock(snapshot.fetchedAt)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
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

      <Pie icons={icons} aviso={AVISO_TASAS} />
    </div>
  );
}

export async function GET() {
  const [snapshot, geistRegular, geistBold, instagramIcon, browserIcon, ...banderasSvg] = await Promise.all([
    getRates(),
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    leerSvgComoDataUri("instagram-icon.svg"),
    leerSvgComoDataUri("browser-icon.svg"),
    ...ORDEN.map((id) => leerSvgComoDataUri(BANDERA_POR_FILA[id])),
  ]);

  const banderas = Object.fromEntries(ORDEN.map((id, i) => [id, banderasSvg[i]])) as Record<FilaPesosId, string>;

  return new ImageResponse(
    <PostImage snapshot={snapshot} banderas={banderas} icons={{ instagram: instagramIcon, browser: browserIcon }} />,
    {
      ...SIZE,
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );
}
