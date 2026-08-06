import { ImageResponse } from "next/og";
import { formatClock, formatDate, formatRate, vigenciaBcv } from "@/lib/format";
import { AVISO_TASAS, COLOR, Encabezado, FilaMoneda, Pie, leerFontBuffer, leerSvgComoDataUri } from "@/lib/og-shared";
import { getRates } from "@/lib/rates";
import type { Rate, RateKey, RatesSnapshot } from "@/lib/types";

/**
 * Imagen del post diario de Instagram: mismo layout que el mockup de
 * referencia, pero renderizado en código (no una captura con parches) para
 * que los montos y la fecha salgan siempre correctos. Instagram la busca
 * como una URL pública normal (`image_url` de la Graph API), así que esta
 * ruta va sin autenticación, a diferencia del cron que la dispara.
 */
export const runtime = "nodejs";

const SIZE = { width: 1080, height: 1080 };

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

  return (
    <FilaMoneda
      banderaSrc={banderaSrc}
      label={rate.label}
      sublabel={esBcv ? vigenciaBcv(rate.updatedAt) : undefined}
      valor={noDisponible ? "No disponible" : `${formatRate(rate.bsPerUnit)} Bs`}
      noDisponible={noDisponible}
    />
  );
}

function PostImage({ snapshot, banderas, icons }: { snapshot: RatesSnapshot; banderas: Record<string, string>; icons: { instagram: string; browser: string } }) {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Encabezado subtitulo="Cuánto vale tu dinero hoy" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ fontSize: 32, color: COLOR.foreground, fontWeight: 700 }}>
            {formatDate(snapshot.fetchedAt)}
          </span>
          <span style={{ fontSize: 32, color: COLOR.foreground, fontWeight: 700 }}>
            {formatClock(snapshot.fetchedAt)}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {FILAS.map((key) => (
          <FilaTasa key={key} rate={snapshot.rates[key]} banderaSrc={banderas[key]} />
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
    ...FILAS.map((key) => leerSvgComoDataUri(BANDERA_POR_TASA[key]!)),
  ]);

  const banderas = Object.fromEntries(FILAS.map((key, i) => [key, banderasSvg[i]]));

  return new ImageResponse(<PostImage snapshot={snapshot} banderas={banderas} icons={{ instagram: instagramIcon, browser: browserIcon }} />, {
    ...SIZE,
    fonts: [
      { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
      { name: "Geist", data: geistBold, weight: 700, style: "normal" },
    ],
  });
}
