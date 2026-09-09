import { ImageResponse } from "next/og";
import { techoDeImagenes } from "@/lib/og-limite";
import sharp from "sharp";
import { leerFontBuffer, leerSvgComoDataUri } from "@/lib/og-shared";
import { PortadaParada, TAMANO_PARADA } from "@/lib/og-parada";
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

export async function GET(request: Request) {
  const techo = techoDeImagenes(request);
  if (techo) return techo;

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
      <PortadaParada
        titulo={borrador.titulo}
        lugar={borrador.lugar}
        compra={borrador.compra}
        venta={borrador.venta}
        imageDataUri={imageDataUri}
        icons={{ instagram: instagramIcon, browser: browserIcon }}
      />
    ),
    {
      ...TAMANO_PARADA,
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );
}
