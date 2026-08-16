import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { formatVariacion } from "@/lib/format";
import { AIRE_LATERAL, AVISO_SEMANAL, COLOR, LogoTaza, Pie, leerFontBuffer, leerSvgComoDataUri } from "@/lib/og-shared";
import { getRates } from "@/lib/rates";
import { construirReporteSemanal, type DireccionVariacion, type FilaSemanal, type ReporteSemanal } from "@/lib/semanal";

/**
 * Imagen del reporte semanal: cuánto se movió cada tasa en los últimos siete
 * días.
 *
 * Va **sin firma HMAC**, al contrario que `instagram-post-news`. El criterio no
 * es quién la llama sino si recibe texto controlable por quien arme la URL:
 * aquella lo lleva porque el titular y la fuente viajan por query, y sin firma
 * cualquiera generaría una imagen con la marca de La Tasa y contenido
 * arbitrario. Esta no recibe ni un carácter de texto libre —lee las tasas y el
 * histórico del servidor, como `instagram-post` e `instagram-post-pesos`, que
 * tampoco van firmadas— y sus únicas entradas son dos valores de un conjunto
 * cerrado. Firmarla añadiría los 403 por conjunto firmado desajustado sin
 * cerrar nada.
 */
export const runtime = "nodejs";

type Proporcion = "1:1" | "9:16";

const SIZE: Record<Proporcion, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

interface Medidas {
  padding: number;
  /**
   * Aire extra arriba y abajo del lienzo vertical. No es estética: en una
   * Story, Instagram superpone su propia interfaz —el avatar y el nombre
   * arriba, el campo de mensaje y las flechas abajo—, y lo que caiga ahí queda
   * tapado. Por eso los 840 px de diferencia entre los dos lienzos no se
   * reparten proporcionalmente.
   */
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
  /** Ancho fijo de la columna derecha: sin él, un número largo empuja el título. */
  anchoVariacion: number;
}

/**
 * El diseño de referencia pide la variación a 104 px. Eso **solo cabe en
 * 9:16** (y aun ahí baja a 76 para que "↑ 4,1 pp" no envuelva): en el cuadrado,
 * a ese tamaño se perdían la tercera tarjeta y el pie entero. No es un
 * descuido, es la adaptación del lienzo.
 *
 * La tipografía es Geist Bold y no la Inter Black de la referencia: Geist es la
 * fuente del proyecto y es la única que está en `app/api/og/_assets`. Añadir un
 * tercer `.ttf` al bundle de la función por un peso no compensa.
 */
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

function colorDe(direccion: DireccionVariacion): string {
  if (direccion === "sube") return COLOR.danger;
  if (direccion === "baja") return COLOR.accent;
  return COLOR.muted;
}

function flechaDe(direccion: DireccionVariacion): string {
  if (direccion === "sube") return "↑";
  if (direccion === "baja") return "↓";
  return "";
}

function CabeceraSemanal({ reporte, medidas }: { reporte: ReporteSemanal; medidas: Medidas }) {
  const aviso = reporte.sinComparacion;

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
          // La línea de aviso ocupa alto, y en el cuadrado no sobra ninguno:
          // se compensa apretando la cabecera en vez de desbordar el lienzo.
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

      <span style={{ fontSize: medidas.rango, color: COLOR.muted, marginTop: 16 }}>{reporte.rangoTexto}</span>

      {aviso && (
        <span style={{ fontSize: medidas.rango - 2, color: COLOR.muted, marginTop: 10 }}>
          Primer reporte: aún no hay una semana completa de histórico.
        </span>
      )}
    </div>
  );
}

function TarjetaSemanal({ fila, medidas }: { fila: FilaSemanal; medidas: Medidas }) {
  const color = colorDe(fila.direccion);
  const noDisponible = fila.valor === null;

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
            style={{
              fontSize: medidas.tituloTarjeta,
              fontWeight: 700,
              color: COLOR.foreground,
              whiteSpace: "nowrap",
            }}
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
              color: noDisponible ? COLOR.warning : COLOR.foreground,
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
            // Sin dato de la semana pasada no se pinta ni flecha ni cifra: un
            // "0,0 %" ahí sería un número inventado, y un guion suelto no dice
            // nada.
            <span style={{ fontSize: medidas.subtituloTarjeta + 4, color: COLOR.muted, textAlign: "right" }}>
              Sin comparación
            </span>
          ) : fila.direccion === "igual" ? (
            <span style={{ fontSize: medidas.subtituloTarjeta + 4, color: COLOR.muted, textAlign: "right" }}>
              Sin cambios
            </span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span
                style={{ fontSize: medidas.variacion, fontWeight: 700, color, lineHeight: 1, whiteSpace: "nowrap" }}
              >
                {flechaDe(fila.direccion)} {formatVariacion(fila.variacion, fila.unidadVariacion)}
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

function SemanalImage({
  reporte,
  proporcion,
  icons,
}: {
  reporte: ReporteSemanal;
  proporcion: Proporcion;
  icons: { instagram: string; browser: string };
}) {
  const medidas = MEDIDAS[proporcion];
  const aviso = reporte.sinComparacion;

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
      <CabeceraSemanal reporte={reporte} medidas={medidas} />

      {/* Sin `flex: 1` en las tarjetas: crecerían y el valor dejaría de estar
          pegado a su título. El aire sobrante lo reparte el `space-between`. */}
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
        {reporte.filas.map((fila) => (
          <TarjetaSemanal key={fila.id} fila={fila} medidas={medidas} />
        ))}
      </div>

      <Pie icons={icons} aviso={AVISO_SEMANAL} />
    </div>
  );
}

function proporcionDesdeQuery(request: NextRequest): Proporcion {
  return request.nextUrl.searchParams.get("proporcion") === "9:16" ? "9:16" : "1:1";
}

export async function GET(request: NextRequest) {
  const proporcion = proporcionDesdeQuery(request);

  const [snapshot, geistRegular, geistBold, instagramIcon, browserIcon] = await Promise.all([
    getRates(),
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    leerSvgComoDataUri("instagram-icon.svg"),
    leerSvgComoDataUri("browser-icon.svg"),
  ]);

  const reporte = await construirReporteSemanal(snapshot);

  const imagen = new ImageResponse(
    <SemanalImage reporte={reporte} proporcion={proporcion} icons={{ instagram: instagramIcon, browser: browserIcon }} />,
    {
      ...SIZE[proporcion],
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );

  // La descarga va por cabecera y no con el atributo `download` de HTML, que en
  // iOS es poco fiable y el admin trabaja desde el teléfono.
  if (request.nextUrl.searchParams.get("descargar") !== "1") return imagen;

  const nombre = `reporte-semanal-${reporte.hasta}-${proporcion === "9:16" ? "9x16" : "1x1"}.png`;
  const cabeceras = new Headers(imagen.headers);
  cabeceras.set("Content-Disposition", `attachment; filename="${nombre}"`);

  return new Response(imagen.body, { status: imagen.status, headers: cabeceras });
}
