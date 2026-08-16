/**
 * PROTOTIPO desechable: renderiza la plantilla del reporte semanal a PNG con
 * datos ficticios, para aprobar el diseño antes de implementar nada.
 *
 * No forma parte de la app. Se borra al convertir la plantilla en la ruta
 * `app/api/og/instagram-semanal`.
 *
 *   npx tsx scripts/_prototipo-semanal.tsx
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const SALIDA = process.argv[2] ?? "/tmp/prototipo-semanal";

const COLOR = {
  background: "#0b1120",
  surface: "#131c2f",
  border: "#26324c",
  foreground: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  kicker: "#38bdf8",
};

const AVISO_SEMANAL =
  "Fuentes: BCV, Binance P2P y Banco de la República (TRM). Datos con fines " +
  "informativos, consulta siempre la fuente oficial. · latasa.online";

type Direccion = "sube" | "baja" | "igual" | "desconocida";

interface Fila {
  titulo: string;
  subtitulo: string;
  valorTexto: string;
  variacionTexto: string;
  direccion: Direccion;
}

const FILAS: Fila[] = [
  {
    titulo: "Dólar BCV",
    subtitulo: "Tasa oficial · Banco Central de Venezuela",
    valorTexto: "757,54 Bs",
    variacionTexto: "1,4 %",
    direccion: "sube",
  },
  {
    titulo: "Brecha BCV / Binance",
    subtitulo: "Diferencia entre tasa oficial y tasa P2P",
    valorTexto: "34,2 %",
    variacionTexto: "4,1 pp",
    direccion: "sube",
  },
  {
    titulo: "TRM · Peso colombiano",
    subtitulo: "Peso frente al dólar · Banrep",
    valorTexto: "3.940,18 COP",
    variacionTexto: "0,3 %",
    direccion: "baja",
  },
];

const FILAS_SIN_HISTORICO: Fila[] = FILAS.map((fila) => ({
  ...fila,
  variacionTexto: "Sin comparación",
  direccion: "desconocida",
}));

const RANGO = "Lunes 10 — Domingo 16 de agosto";

/** Sube → rojo, baja → verde: el color dice qué significa, no el signo. */
function colorDe(direccion: Direccion): string {
  if (direccion === "sube") return COLOR.danger;
  if (direccion === "baja") return COLOR.accent;
  return COLOR.muted;
}

function flechaDe(direccion: Direccion): string {
  if (direccion === "sube") return "↑";
  if (direccion === "baja") return "↓";
  return "";
}

type Proporcion = "1:1" | "9:16";

const SIZE: Record<Proporcion, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

interface Medidas {
  padding: number;
  reservaArriba: number;
  reservaAbajo: number;
  gapTarjetas: number;
  kicker: number;
  titular: number;
  rango: number;
  tituloTarjeta: number;
  subtituloTarjeta: number;
  valor: number;
  variacion: number;
  paddingTarjeta: number;
  logo: number;
  wordmark: number;
  /** Ancho fijo de la columna de la derecha: sin él, un número largo empuja el título. */
  anchoVariacion: number;
}

const MEDIDAS: Record<Proporcion, Medidas> = {
  "1:1": {
    padding: 56,
    reservaArriba: 0,
    reservaAbajo: 0,
    gapTarjetas: 18,
    kicker: 22,
    titular: 46,
    rango: 24,
    tituloTarjeta: 34,
    subtituloTarjeta: 20,
    valor: 38,
    variacion: 52,
    paddingTarjeta: 20,
    logo: 60,
    wordmark: 38,
    anchoVariacion: 250,
  },
  "9:16": {
    padding: 72,
    reservaArriba: 110,
    reservaAbajo: 130,
    gapTarjetas: 32,
    kicker: 28,
    titular: 68,
    rango: 30,
    tituloTarjeta: 36,
    subtituloTarjeta: 22,
    valor: 52,
    variacion: 76,
    paddingTarjeta: 34,
    logo: 80,
    wordmark: 52,
    anchoVariacion: 320,
  },
};

const AIRE_LATERAL = 40;

function LogoTaza({ tamano }: { tamano: number }) {
  return (
    <svg
      width={tamano}
      height={tamano}
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

function CabeceraSemanal({ medidas, aviso }: { medidas: Medidas; aviso: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        paddingLeft: AIRE_LATERAL,
        paddingRight: AIRE_LATERAL,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <LogoTaza tamano={medidas.logo} />
        <div style={{ display: "flex", fontSize: medidas.wordmark, fontWeight: 700 }}>
          <span style={{ color: COLOR.foreground }}>La&nbsp;</span>
          <span style={{ color: COLOR.accent }}>Tasa</span>
        </div>
      </div>

      <span
        style={{
          fontSize: medidas.kicker,
          fontWeight: 700,
          color: COLOR.kicker,
          letterSpacing: 4,
          marginTop: aviso ? medidas.padding * 0.35 : medidas.padding * 0.7,
        }}
      >
        REPORTE SEMANAL
      </span>

      {/* Dos líneas explícitas: el corte natural caería donde no toca. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: medidas.titular,
          fontWeight: 700,
          color: COLOR.foreground,
          lineHeight: 1.08,
          marginTop: 10,
        }}
      >
        <span>Así se movieron</span>
        <span>las tasas esta semana</span>
      </div>

      <span style={{ fontSize: medidas.rango, color: COLOR.muted, marginTop: 16 }}>{RANGO}</span>

      {aviso && (
        <span style={{ fontSize: medidas.rango - 2, color: COLOR.muted, marginTop: 10 }}>
          Primer reporte: aún no hay una semana completa de histórico.
        </span>
      )}
    </div>
  );
}

function TarjetaSemanal({ fila, medidas }: { fila: Fila; medidas: Medidas }) {
  const color = colorDe(fila.direccion);
  const flecha = flechaDe(fila.direccion);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        backgroundColor: COLOR.surface,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 28,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", width: 10, backgroundColor: COLOR.accent }} />

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          padding: medidas.paddingTarjeta,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 24 }}>
          <span
            style={{ fontSize: medidas.tituloTarjeta, fontWeight: 700, color: COLOR.foreground, whiteSpace: "nowrap" }}
          >
            {fila.titulo}
          </span>
          <span style={{ fontSize: medidas.subtituloTarjeta, color: COLOR.muted, marginTop: 6 }}>
            {fila.subtitulo}
          </span>
          <span
            style={{
              fontSize: medidas.valor,
              fontWeight: 700,
              color: COLOR.foreground,
              marginTop: 14,
            }}
          >
            {fila.valorTexto}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "center",
            width: medidas.anchoVariacion,
            flexShrink: 0,
          }}
        >
          {fila.direccion === "desconocida" ? (
            <span style={{ fontSize: medidas.subtituloTarjeta + 4, color: COLOR.muted, textAlign: "right" }}>
              {fila.variacionTexto}
            </span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span
                style={{ fontSize: medidas.variacion, fontWeight: 700, color, lineHeight: 1, whiteSpace: "nowrap" }}
              >
                {flecha} {fila.variacionTexto}
              </span>
              <span style={{ fontSize: medidas.subtituloTarjeta - 2, color: COLOR.muted, marginTop: 8 }}>
                en la semana
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pie({ instagramIcon, browserIcon }: { instagramIcon: string; browserIcon: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderTop: `1px solid ${COLOR.border}`,
        paddingTop: 24,
      }}
    >
      <span
        style={{
          fontSize: 20,
          color: COLOR.foreground,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={browserIcon} width={34} height={34} alt="" /> www.latasa.online
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={instagramIcon} width={34} height={34} alt="" /> @latasa.online
      </span>
      <span style={{ fontSize: 16, color: COLOR.muted, lineHeight: 1.5, textAlign: "center", marginTop: 6 }}>
        {AVISO_SEMANAL}
      </span>
    </div>
  );
}

function Plantilla({
  proporcion,
  filas,
  aviso,
  icons,
}: {
  proporcion: Proporcion;
  filas: Fila[];
  aviso: boolean;
  icons: { instagram: string; browser: string };
}) {
  const medidas = MEDIDAS[proporcion];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: COLOR.background,
        backgroundImage: `linear-gradient(160deg, #101a33 0%, ${COLOR.background} 45%, #0a1a1a 100%)`,
        paddingLeft: medidas.padding,
        paddingRight: medidas.padding,
        paddingTop: medidas.padding + medidas.reservaArriba,
        paddingBottom: medidas.padding + medidas.reservaAbajo,
        fontFamily: "Geist",
      }}
    >
      <CabeceraSemanal medidas={medidas} aviso={aviso} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: aviso ? medidas.gapTarjetas - 4 : medidas.gapTarjetas,
          marginTop: aviso ? 6 : 18,
          marginBottom: aviso ? 6 : 18,
          paddingLeft: AIRE_LATERAL,
          paddingRight: AIRE_LATERAL,
        }}
      >
        {filas.map((fila) => (
          <TarjetaSemanal key={fila.titulo} fila={fila} medidas={medidas} />
        ))}
      </div>

      <Pie instagramIcon={icons.instagram} browserIcon={icons.browser} />
    </div>
  );
}

async function svgDataUri(nombre: string): Promise<string> {
  const buffer = await readFile(path.join(process.cwd(), "public/SVG", nombre));
  return `data:image/svg+xml;base64,${buffer.toString("base64")}`;
}

async function main() {
  const [geistRegular, geistBold, instagram, browser] = await Promise.all([
    readFile(path.join(process.cwd(), "app/api/og/_assets/Geist-Regular.ttf")),
    readFile(path.join(process.cwd(), "app/api/og/_assets/Geist-Bold.ttf")),
    svgDataUri("instagram-icon.svg"),
    svgDataUri("browser-icon.svg"),
  ]);

  await mkdir(SALIDA, { recursive: true });

  const variantes: Array<{ nombre: string; proporcion: Proporcion; filas: Fila[]; aviso: boolean }> = [
    { nombre: "semanal-1x1", proporcion: "1:1", filas: FILAS, aviso: false },
    { nombre: "semanal-9x16", proporcion: "9:16", filas: FILAS, aviso: false },
    { nombre: "semanal-1x1-sin-historico", proporcion: "1:1", filas: FILAS_SIN_HISTORICO, aviso: true },
  ];

  for (const variante of variantes) {
    const respuesta = new ImageResponse(
      (
        <Plantilla
          proporcion={variante.proporcion}
          filas={variante.filas}
          aviso={variante.aviso}
          icons={{ instagram, browser }}
        />
      ),
      {
        ...SIZE[variante.proporcion],
        fonts: [
          { name: "Geist", data: geistRegular as unknown as ArrayBuffer, weight: 400, style: "normal" },
          { name: "Geist", data: geistBold as unknown as ArrayBuffer, weight: 700, style: "normal" },
        ],
      },
    );

    const destino = path.join(SALIDA, `${variante.nombre}.png`);
    await writeFile(destino, Buffer.from(await respuesta.arrayBuffer()));
    console.log(destino);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
