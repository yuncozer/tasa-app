import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { convert, isRateKey } from "@/lib/convert";
import { formatAmount, formatClock, formatDate, formatRate } from "@/lib/format";
import { techoDeImagenes } from "@/lib/og-limite";
import {
  AIRE_LATERAL,
  AVISO_TASAS,
  COLOR,
  Encabezado,
  Pie,
  leerFontBuffer,
  leerSvgComoDataUri,
} from "@/lib/og-shared";
import { RATE_ORDER, getRates, rateMeta } from "@/lib/rates";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/**
 * La cifra convertida, como imagen para compartir.
 *
 * La app existe para responder "¿cuánto es esto en la otra moneda?", y esa
 * respuesta termina casi siempre en un chat de WhatsApp. Hasta ahora salía de
 * aquí como **texto pelado** (`BotonCopiar`): un número suelto, sin decir con
 * qué tasa se hizo la cuenta, sin fecha, sin marca y sin forma de volver. El
 * dato más compartido del proyecto viajaba sin nada que lo respaldara.
 *
 * Esta imagen lleva las cuatro cosas que a ese número le faltaban: **con qué
 * tasa**, **de cuándo es**, **de dónde salió** y **dónde repetir la cuenta con
 * otro monto**.
 *
 * **Sin firma HMAC**, y el criterio es el mismo que en `instagram-semanal` y
 * `instagram-brecha`: lo que se firma es el texto libre, y aquí no hay ninguno.
 * Las tasas y las etiquetas las pone el servidor; de la URL solo llegan una
 * clave de un conjunto cerrado y un número, que además va acotado a los mismos
 * 12 dígitos que admite el teclado de la calculadora. Nadie puede hacer que
 * esta plantilla afirme algo que no sea una conversión real de hoy.
 */
export const runtime = "nodejs";

/** El mismo tope de dígitos que acepta el teclado de la calculadora. */
const MAX_DIGITOS = 12;

const SIZE = { width: 1200, height: 630 };

/**
 * Cuántas equivalencias caben sin que la tipografía baje de lo legible.
 *
 * Cinco y no cuatro: con cuatro se quedaba fuera el **peso Binance**, que en
 * esta frontera es la fila que más se mira. Quitando el origen y el bolívar
 * —que va destacado aparte— `RATE_ORDER` deja como mucho cinco, así que este
 * tope no recorta nada en la práctica; está para que un cambio futuro en
 * `RATE_ORDER` no desborde el lienzo en silencio.
 */
const MAX_FILAS = 5;

/** Ancho útil de la columna izquierda, donde vive el número grande. */
const ANCHO_MONTO = 440;

/**
 * Cuánto tiene que medir el número grande para caber en su columna.
 *
 * Satori no ajusta el texto al contenedor —no hay `text-overflow` ni un
 * equivalente de "encoger hasta que quepa"— así que el tamaño se calcula a
 * mano a partir de cuántos caracteres tiene. Sin esto, un monto de doce
 * dígitos se salía de su columna y las tarjetas de la derecha lo tapaban:
 * comprobado renderizando `monto=999999999999`.
 *
 * El 0,62 es el ancho medio de un dígito de Geist en negrita respecto de su
 * tamaño. Es una estimación, y por eso el tope se pone sobre un ancho algo
 * menor que la columna: pasarse de listo aquí cuesta un número cortado, y
 * quedarse corto solo cuesta unos píxeles de aire.
 */
function tamanoDelMonto(texto: string): number {
  return Math.min(70, Math.floor(ANCHO_MONTO / (texto.length * 0.62)));
}

function montoValido(valor: string | null): number | null {
  if (!valor) return null;
  const monto = Number(valor);
  if (!Number.isFinite(monto) || monto <= 0) return null;
  if (Math.floor(monto).toString().length > MAX_DIGITOS) return null;
  return monto;
}

function Fila({ etiqueta, valor, clave }: { etiqueta: string; valor: number | null; clave: RateKey }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "11px 22px",
        borderRadius: 18,
        border: `1px solid ${COLOR.border}`,
        background: COLOR.surface,
      }}
    >
      {/* La etiqueta cede el sitio y el monto nunca se encoge: es la misma
          regla que `RateCard` en la app —los números no se parten—. */}
      <span style={{ fontSize: 27, color: COLOR.foreground, flex: 1, overflow: "hidden" }}>{etiqueta}</span>
      <span style={{ fontSize: 31, fontWeight: 700, color: COLOR.foreground, flexShrink: 0 }}>
        {formatAmount(valor, clave)}
      </span>
    </div>
  );
}

function ConversionImage({
  monto,
  origen,
  snapshot,
  icons,
}: {
  monto: number;
  origen: RateKey;
  snapshot: RatesSnapshot;
  icons: { instagram: string; browser: string };
}) {
  const conversion = convert(monto, origen, snapshot);
  const meta = rateMeta(origen);
  const tasa = snapshot.rates[origen]?.bsPerUnit ?? null;

  // El bolívar es el pivote y va destacado arriba, igual que en la
  // calculadora; el resto queda debajo, en el orden de siempre.
  const otras = RATE_ORDER.filter((key) => key !== origen && key !== "VES").slice(0, MAX_FILAS);
  const bolivares = formatAmount(conversion.bs, "VES");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: COLOR.background,
        color: COLOR.foreground,
        padding: `28px ${AIRE_LATERAL}px`,
        fontFamily: "Geist",
      }}
    >
      <Encabezado subtitulo={`${formatDate(snapshot.fetchedAt)} · ${formatClock(snapshot.fetchedAt)}`} escala={0.7} />

      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 460, gap: 6, overflow: "hidden" }}>
          <span style={{ fontSize: 26, color: COLOR.muted }}>
            {formatAmount(monto, origen)} {meta.shortLabel}
          </span>
          <span
            style={{
              fontSize: tamanoDelMonto(bolivares),
              fontWeight: 700,
              color: COLOR.accent,
              lineHeight: 1.05,
            }}
          >
            {bolivares}
          </span>
          <span style={{ fontSize: 32, color: COLOR.foreground }}>bolívares</span>
          {/* La tasa usada, que es la mitad de lo que un número suelto no
              dice. Con la fuente al lado: quien recibe esto por WhatsApp
              puede contrastarlo sin preguntar de dónde salió. */}
          <span style={{ fontSize: 22, color: COLOR.muted, marginTop: 8 }}>
            {tasa === null
              ? "Tasa no disponible"
              : `${meta.label}: 1 ${meta.symbol} = ${formatRate(tasa)} Bs · ${snapshot.rates[origen]?.source ?? ""}`}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {otras.map((key) => (
            <Fila key={key} clave={key} etiqueta={rateMeta(key).label} valor={conversion.results[key]} />
          ))}
        </div>
      </div>

      <Pie icons={icons} aviso={AVISO_TASAS} />
    </div>
  );
}

export async function GET(request: NextRequest) {
  const techo = techoDeImagenes(request);
  if (techo) return techo;

  const monto = montoValido(request.nextUrl.searchParams.get("monto"));
  const origen = request.nextUrl.searchParams.get("origen");

  // Se responde 400 y no una imagen por defecto: una URL mal armada tiene que
  // notarse al construirla, no salir a un chat con un monto que nadie pidió.
  if (monto === null || !isRateKey(origen)) {
    return new Response("Parámetros inválidos", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const [snapshot, geistRegular, geistBold, instagramIcon, browserIcon] = await Promise.all([
    getRates(),
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    leerSvgComoDataUri("instagram-icon.svg"),
    leerSvgComoDataUri("browser-icon.svg"),
  ]);

  return new ImageResponse(
    <ConversionImage
      monto={monto}
      origen={origen}
      snapshot={snapshot}
      icons={{ instagram: instagramIcon, browser: browserIcon }}
    />,
    {
      ...SIZE,
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );
}
