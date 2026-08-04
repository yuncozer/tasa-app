import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { formatDate, formatRate } from "@/lib/format";
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

const COLOR = {
  background: "#0b1120",
  surface: "#131c2f",
  border: "#26324c",
  foreground: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#34d399",
  warning: "#fbbf24",
};

const FILAS: RateKey[] = ["USD_BCV", "USD_BINANCE_BUY", "USD_BINANCE_SELL", "EUR_BCV", "COP_FRONTERA"];

const BANDERA_POR_TASA: Partial<Record<RateKey, string>> = {
  USD_BCV: "Flag-of-US.svg",
  USD_BINANCE_BUY: "Flag-of-US.svg",
  USD_BINANCE_SELL: "Flag-of-US.svg",
  EUR_BCV: "Flag-of-European-Union.svg",
  COP_FRONTERA: "Flag-of-Colombia.svg",
};

async function leerFontBuffer(nombre: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "app/api/og/instagram-post/assets", nombre));
}

async function leerSvgComoDataUri(nombre: string): Promise<string> {
  const buffer = await readFile(path.join(process.cwd(), "public/SVG", nombre));
  return `data:image/svg+xml;base64,${buffer.toString("base64")}`;
}

function LogoTaza() {
  return (
    <svg
      width={56}
      height={56}
      viewBox="0 0 24 24"
      fill="none"
      stroke={COLOR.accent}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M11 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M14.5 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M3.5 8h13.5v5.6a5.2 5.2 0 0 1-5.2 5.2H8.7A5.2 5.2 0 0 1 3.5 13.6V8Z" />
      <path d="M17 9.6h1.3a2.6 2.6 0 0 1 0 5.2H17" />
      <path d="M2.5 21.3h16" />
    </svg>
  );
}

function FilaTasa({ rate, banderaSrc }: { rate: Rate; banderaSrc: string }) {
  const noDisponible = rate.bsPerUnit === null;
  const colorTexto = noDisponible ? COLOR.warning : COLOR.accent;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        border: `2px solid ${noDisponible ? COLOR.warning : COLOR.accent}`,
        backgroundColor: COLOR.surface,
        borderRadius: 9999,
        padding: "22px 34px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "flex",
            width: 56,
            height: 56,
            borderRadius: 9999,
            overflow: "hidden",
            border: `2px solid ${COLOR.border}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
          <img src={banderaSrc} width={56} height={56} style={{ objectFit: "cover" }} alt="" />
        </div>
        <span style={{ fontSize: 32, color: COLOR.foreground }}>{rate.label}</span>
      </div>
      <span style={{ fontSize: 46, fontWeight: 700, color: colorTexto }}>
        {noDisponible ? "No disponible" : `${formatRate(rate.bsPerUnit)} Bs`}
      </span>
    </div>
  );
}

function PostImage({ snapshot, banderas }: { snapshot: RatesSnapshot; banderas: Record<string, string> }) {
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <LogoTaza />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 700 }}>
              <span style={{ color: COLOR.foreground }}>La&nbsp;</span>
              <span style={{ color: COLOR.accent }}>Tasa</span>
            </div>
            <span style={{ fontSize: 22, color: COLOR.muted }}>Cuánto vale tu dinero hoy</span>
          </div>
        </div>
        <span style={{ fontSize: 24, color: COLOR.muted }}>{formatDate(snapshot.fetchedAt)}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {FILAS.map((key) => (
          <FilaTasa key={key} rate={snapshot.rates[key]} banderaSrc={banderas[key]} />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderTop: `1px solid ${COLOR.border}`,
          paddingTop: 24,
        }}
      >
        <span style={{ fontSize: 26, color: COLOR.accent, fontWeight: 700 }}>
          latasa.online · @latasa.online
        </span>
        <span style={{ fontSize: 16, color: COLOR.muted, lineHeight: 1.5 }}>
          La Tasa muestra tasas obtenidas de fuentes públicas de terceros con fines
          exclusivamente informativos. No fijamos, certificamos ni garantizamos ninguna
          tasa de cambio, no intervenimos en operaciones de compra o venta de divisas y
          nada de lo aquí mostrado constituye asesoría financiera. Los datos pueden estar
          desactualizados o contener errores: confirma siempre con la fuente oficial antes
          de cerrar cualquier operación.
        </span>
      </div>
    </div>
  );
}

export async function GET() {
  const [snapshot, geistRegular, geistBold, ...banderasSvg] = await Promise.all([
    getRates(),
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    ...FILAS.map((key) => leerSvgComoDataUri(BANDERA_POR_TASA[key]!)),
  ]);

  const banderas = Object.fromEntries(FILAS.map((key, i) => [key, banderasSvg[i]]));

  return new ImageResponse(<PostImage snapshot={snapshot} banderas={banderas} />, {
    ...SIZE,
    fonts: [
      { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
      { name: "Geist", data: geistBold, weight: 700, style: "normal" },
    ],
  });
}
