import type { NextRequest } from "next/server";
import { techoDeImagenes } from "@/lib/og-limite";
import { ImageResponse } from "next/og";
import sharp from "sharp";
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

/**
 * Ancho fijo en 1080; el alto varía con la proporción del carrusel. `"4:5"`
 * solo lo produce un carrusel cuyo primer elemento es un video (nunca lleva
 * `title`, así que la rama `ALTO_FOTO.principal` no necesita una variante 4:5).
 */
const SIZE: Record<"1:1" | "4:5", { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};
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
 * un hueco. En 4:5 el lienzo crece 270 px respecto de 1:1, y ese sobrante
 * también se lo queda la foto: `title` y `"4:5"` nunca coexisten (el
 * principal-video que dispara el 4:5 jamás lleva título).
 */
const ALTO_FOTO = { principal: 560, secundaria: 700, secundariaAncha: 970 };

function Portada({
  title,
  source,
  imageDataUri,
  icons,
  proporcion,
}: {
  /** Ausente en las diapositivas secundarias de un carrusel. */
  title?: string;
  source: string;
  imageDataUri: string;
  icons: { instagram: string; browser: string };
  proporcion: "1:1" | "4:5";
}) {
  const altoFoto = title
    ? ALTO_FOTO.principal
    : proporcion === "4:5"
      ? ALTO_FOTO.secundariaAncha
      : ALTO_FOTO.secundaria;

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: 15 }}>
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

/**
 * Nombre con el que se guarda la imagen al descargarla. Se deriva del titular
 * para que varias diapositivas no acaben todas como "descarga (1).png" en la
 * carpeta del teléfono.
 */
function nombreDeArchivo(title: string | null): string {
  const base = (title ?? "la-tasa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `${base || "la-tasa"}.png`;
}

export async function GET(request: NextRequest) {
  const techo = techoDeImagenes(request);
  if (techo) return techo;

  const params = request.nextUrl.searchParams;
  const title = params.get("title");
  const image = params.get("image");
  const source = params.get("source");
  const sig = params.get("sig");
  const proporcion = params.get("proporcion") === "4:5" ? "4:5" : "1:1";

  if (!image || !source || !sig) {
    return new Response("Faltan parámetros", { status: 400 });
  }

  /**
   * El título sólo viaja en la diapositiva principal; en las secundarias de
   * un carrusel no se repite. La firma se calcula sobre exactamente los
   * parámetros presentes, así que quitar o añadir `title` (o cambiar
   * `proporcion`) a una URL ya firmada la invalida — no hay forma de colar
   * un titular ajeno ni de estirar un lienzo sin permiso.
   */
  const firmados: Record<string, string> = title
    ? { title, image, source, proporcion }
    : { image, source, proporcion };
  if (!verifyNewsImageParams(firmados, sig)) {
    return new Response("Firma inválida", { status: 403 });
  }

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

  const imagen = new ImageResponse(
    (
      <Portada
        title={title ?? undefined}
        source={source}
        imageDataUri={imageDataUri}
        icons={{ instagram: instagramIcon, browser: browserIcon }}
        proporcion={proporcion}
      />
    ),
    {
      ...SIZE[proporcion],
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );

  if (!params.has("descargar")) return imagen;

  /**
   * Descarga desde la vista previa de `/admin/noticia`. Va por cabecera y no
   * con el atributo `download` de HTML porque en iOS ese atributo es poco
   * fiable, y el admin trabaja desde el teléfono.
   *
   * `descargar` **no entra en el conjunto firmado** —arriba se reconstruye
   * leyendo claves conocidas por nombre—, así que añadirlo no invalida la
   * firma. Tampoco amplía nada: solo cambia una cabecera, la imagen que se
   * genera es exactamente la misma.
   */
  const cabeceras = new Headers(imagen.headers);
  cabeceras.set("Content-Disposition", `attachment; filename="${nombreDeArchivo(title)}"`);
  return new Response(imagen.body, { status: imagen.status, headers: cabeceras });
}
