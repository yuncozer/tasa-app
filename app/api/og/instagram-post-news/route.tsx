import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatDate } from "@/lib/format";
import { AVISO_NOTICIA, COLOR, Encabezado, Pie, leerFontBuffer, leerSvgComoDataUri } from "@/lib/og-shared";
import { verifyNewsImageParams } from "@/lib/news-signature";

/**
 * Imagen del post ocasional de noticia: la foto del artículo enmarcada con
 * la identidad de La Tasa. A diferencia del post diario, recibe texto
 * controlable por quien arme la URL (título/imagen/fuente), así que exige
 * una firma válida (`lib/news-signature.ts`) antes de renderizar — solo
 * `app/api/publish-instagram-news` puede generarla. Aun así queda sin
 * autenticación por header: Instagram debe poder descargarla como una URL
 * pública normal, igual que la del post diario.
 */
export const runtime = "nodejs";

const SIZE = { width: 1080, height: 1080 };
const TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Descarga la imagen del artículo y la normaliza a PNG con `sharp`: Satori
 * no garantiza poder rasterizar formatos como AVIF, que sí usan algunos
 * portales (lapatilla.com, por ejemplo).
 */
async function descargarImagenComoPng(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
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

/**
 * Alto de la foto dentro del marco. En las diapositivas secundarias no hay
 * titular debajo, así que ese espacio se lo queda la imagen en vez de dejar
 * un hueco.
 */
const ALTO_FOTO = { principal: 560, secundaria: 700 };

function Portada({
  title,
  source,
  imageDataUri,
  fecha,
  icons,
}: {
  /** Ausente en las diapositivas secundarias de un carrusel. */
  title?: string;
  source: string;
  imageDataUri: string;
  /** Ausente en las diapositivas secundarias de un carrusel. */
  fecha?: string;
  icons: { instagram: string; browser: string };
}) {
  const altoFoto = title ? ALTO_FOTO.principal : ALTO_FOTO.secundaria;

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Encabezado subtitulo="Noticias" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, marginTop: 15 }}>
          {fecha ? <span style={{ fontSize: 32, color: COLOR.foreground, fontWeight: 700 }}>{fecha}</span> : null}
          <span style={{ fontSize: 24, color: COLOR.muted, fontWeight: 700 }}>{`@latasa.online`}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: `2px solid ${COLOR.accent}`,
          borderRadius: 24,
          overflow: "hidden",
          padding: 0,
          marginTop: 15,
          marginBottom: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
        <img src={imageDataUri} width={968} height={altoFoto} style={{ objectFit: "cover", width: "100%", height: altoFoto }} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, backgroundColor: COLOR.surface, padding: "18px 28px" }}>
          {title ? (
            <span style={{ fontSize: 44, fontWeight: 700, color: COLOR.foreground, lineHeight: 1.25 }}>{title}</span>
          ) : null}
          <span style={{ fontSize: 24, color: COLOR.muted }}>Fuente: {source}</span>
        </div>
      </div>

      <Pie icons={icons} aviso={AVISO_NOTICIA} />
    </div>
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const title = params.get("title");
  const image = params.get("image");
  const source = params.get("source");
  const sig = params.get("sig");

  if (!image || !source || !sig) {
    return new Response("Faltan parámetros", { status: 400 });
  }

  /**
   * El título sólo viaja en la diapositiva principal; en las secundarias de
   * un carrusel no se repite. La firma se calcula sobre exactamente los
   * parámetros presentes, así que quitar o añadir `title` a una URL ya
   * firmada la invalida — no hay forma de colar un titular ajeno.
   */
  const firmados: Record<string, string> = title ? { title, image, source } : { image, source };
  if (!verifyNewsImageParams(firmados, sig)) {
    return new Response("Firma inválida", { status: 403 });
  }

  const ahora = new Date().toISOString();

  let imageDataUri: string;
  try {
    imageDataUri = await descargarImagenComoPng(image);
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
        title={title ?? undefined}
        source={source}
        imageDataUri={imageDataUri}
        fecha={title ? formatDate(ahora) : undefined}
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
