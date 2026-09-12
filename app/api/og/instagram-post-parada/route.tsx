import { ImageResponse } from "next/og";
import { techoDeImagenes } from "@/lib/og-limite";
import sharp from "sharp";
import { leerFontBuffer, leerSvgComoDataUri } from "@/lib/og-shared";
import { PortadaParada, TAMANO_PARADA } from "@/lib/og-parada";
import { leerParadaPendiente, leerParadaPublicada } from "@/lib/parada";

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
 * que alguien abre esa vista previa después. Por eso lee
 * `leerParadaPublicada()` y no el borrador pendiente: aquella fila es un
 * buzón que el cron sobreescribe al detectar la columna del día siguiente,
 * dejando compra/venta en blanco hasta que el admin las confirma, y mientras
 * tanto esta ruta devolvía 404 — o sea, el enlace de `/laparada` se pegaba en
 * WhatsApp sin imagen todos los días, aunque siguiera llevando bien al post
 * anterior. Con la fila aparte la vista previa siempre muestra el post que
 * este enlace de verdad abre, igual que `/hoy`.
 *
 * `?borrador=1` es la excepción, y la pide **solo `/admin/parada`**: ahí se
 * revisa lo que todavía no ha salido, que es justo lo contrario de lo que
 * mira el público. Separar las dos filas sin separar también las dos
 * peticiones dejó esa pantalla con "No se pudo cargar la imagen" — el panel
 * pedía lo publicado, que con un borrador sin publicar no existe. No
 * contradice la falta de firma: es un valor de un conjunto cerrado, no texto
 * libre, y lo que dibuja sale igualmente de Supabase y no de la URL.
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

  const esBorrador = new URL(request.url).searchParams.get("borrador") === "1";
  const borrador = esBorrador ? await leerParadaPendiente() : await leerParadaPublicada();
  if (!borrador || borrador.compra === null || borrador.venta === null) {
    return new Response(
      esBorrador
        ? "Todavía no hay un borrador de La Parada con compra y venta confirmadas"
        : "Todavía no se ha publicado ningún post de La Parada con compra y venta",
      { status: 404 },
    );
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
