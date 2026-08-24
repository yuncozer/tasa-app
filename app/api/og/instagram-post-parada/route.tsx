import { ImageResponse } from "next/og";
import sharp from "sharp";
import { COLOR, LogoTaza, Pie, leerFontBuffer, leerSvgComoDataUri } from "@/lib/og-shared";
import { leerParadaPendiente } from "@/lib/parada";

/**
 * Imagen dedicada de "Dólar en La Parada": a diferencia del marco genérico
 * de noticia (`instagram-post-news`), esta no recibe título/imagen/fuente
 * por query string. Ese marco necesita firma HMAC porque cualquiera podría
 * pedirle que dibuje texto arbitrario con la marca de La Tasa; esta ruta no
 * recibe texto libre en absoluto — lee directo el borrador confirmado en
 * `parada_pendiente` (mismo criterio que `/api/og/instagram-post`, que lee
 * `snapshotDelDia()` en vez de parámetros), así que no hace falta firmar
 * nada.
 *
 * Sirve dos peticiones: la de Meta al publicar, y la de `/laparada` cada vez
 * que alguien abre esa vista previa después. Como el borrador se sobrescribe
 * con el siguiente artículo que detecte el cron, esta imagen siempre
 * refleja "lo último publicado" — igual que `/hoy`.
 */
export const runtime = "nodejs";

const SIZE = { width: 1080, height: 1080 };
const TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Mismo motivo que `instagram-post-news`: Satori no garantiza rasterizar todos los formatos que trae la foto del artículo. */
async function descargarImagenComoPng(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`La imagen del artículo respondió ${response.status}`);

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
    throw new Error("La imagen del artículo supera el tamaño máximo permitido");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("La imagen del artículo supera el tamaño máximo permitido");
  }

  const png = await sharp(buffer).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Aviso legal de esta serie: no es "esta noticia es de terceros" (`AVISO_NOTICIA`), es "este dato es informal y puede cambiar". */
function avisoParada(lugar: string): string {
  return `Tasa informal registrada en un punto físico (${lugar}). Puede variar durante el día y no equivale a la tasa oficial.`;
}

function Tarjeta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        backgroundColor: "#1c2740",
        borderRadius: 16,
        padding: "18px 22px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: COLOR.accent, letterSpacing: 2 }}>{etiqueta}</span>
        <span style={{ fontSize: 18, color: COLOR.muted }}>Billete de 100$</span>
      </div>
      <span style={{ fontSize: 46, fontWeight: 700, color: COLOR.accent }}>{valor}COP</span>
    </div>
  );
}

function Portada({
  titulo,
  lugar,
  compra,
  venta,
  imageDataUri,
  icons,
}: {
  titulo: string;
  lugar: string;
  compra: string;
  venta: string;
  imageDataUri: string;
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
        padding: 40,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LogoTaza />
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>
              <span style={{ color: COLOR.foreground }}>La&nbsp;</span>
              <span style={{ color: COLOR.accent }}>Tasa</span>
            </div>
          </div>
          <span style={{ fontSize: 24, color: COLOR.muted, fontWeight: 700 }}>@latasa.online</span>
        </div>

        <div style={{ display: "flex", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1px solid ${COLOR.kicker}`,
              borderRadius: 9999,
              padding: "10px 22px",
            }}
          >
            <span style={{ fontSize: 22 }}>📍</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: COLOR.kicker }}>{lugar}</span>
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, color: COLOR.foreground, letterSpacing: 3 }}>
            TASA LA PARADA
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: `2px solid ${COLOR.kicker}`,
          borderRadius: 24,
          overflow: "hidden",
          marginTop: 15,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
        <img src={imageDataUri} width={1000} height={440} style={{ objectFit: "cover", width: "100%", height: 440 }} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, backgroundColor: COLOR.surface, padding: "24px 28px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 38, fontWeight: 700, color: COLOR.foreground, lineHeight: 1.2 }}>{titulo}</span>
            <span style={{ fontSize: 22, color: COLOR.muted }}>Fuente: lanacionweb.com</span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", flex: 1 }}>
              <Tarjeta etiqueta="COMPRAN" valor={compra} />
            </div>
            <div style={{ display: "flex", flex: 1 }}>
              <Tarjeta etiqueta="VENDEN" valor={venta} />
            </div>
          </div>
        </div>
      </div>

      <Pie icons={icons} aviso={avisoParada(lugar)} />
    </div>
  );
}

export async function GET() {
  const borrador = await leerParadaPendiente();
  if (!borrador || borrador.compra === null || borrador.venta === null) {
    return new Response("Todavía no hay un borrador de La Parada con compra y venta confirmadas", { status: 404 });
  }

  let imageDataUri: string;
  try {
    imageDataUri = await descargarImagenComoPng(borrador.imagenUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`No se pudo procesar la imagen del artículo: ${detail}`, { status: 502 });
  }

  const [geistRegular, geistBold, instagramIcon, browserIcon] = await Promise.all([
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    leerSvgComoDataUri("instagram-icon.svg"),
    leerSvgComoDataUri("browser-icon.svg"),
  ]);

  return new ImageResponse(
    (
      <Portada
        titulo={borrador.titulo}
        lugar={borrador.lugar}
        compra={borrador.compra}
        venta={borrador.venta}
        imageDataUri={imageDataUri}
        icons={{ instagram: instagramIcon, browser: browserIcon }}
      />
    ),
    {
      ...SIZE,
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );
}
