import { readFile } from "node:fs/promises";
import path from "node:path";
import { signNewsImageParams } from "../lib/news-signature";
import type { FormatoVideo } from "../lib/providers/cloudinary";
import {
  subirMedia,
  urlFotogramaConMarca,
  urlImagen,
  urlVideoConMarca,
} from "../lib/providers/cloudinary";
import { cargarEnvLocal } from "./_env";

/**
 * Imprime las URLs de las cuatro piezas que la app marca, para poder tocar el
 * diseño con el resultado abierto en el navegador y sin publicar nada:
 *
 *   npx tsx scripts/preview-marca.ts foto.jpg    → imagen principal y secundaria
 *   npx tsx scripts/preview-marca.ts clip.mp4    → video en carrusel (1:1) y Reel (9:16)
 *   npx tsx scripts/preview-marca.ts --public-id <id> --tipo video
 *
 * `--fuente` alimenta las dos mitades: en las imágenes es el crédito del marco
 * y en el video, la franja inferior. Con `--fuente ""` el video sale sin
 * franja, que es como va el material propio.
 *
 * La marca de las imágenes la compone la plantilla de
 * `app/api/og/instagram-post-news`, así que esas dos URLs necesitan
 * `npm run dev` levantado; la del video la compone Cloudinary por URL y se
 * abre sin servidor. Hay que correrlo desde la raíz del repo: `asegurarLogo()`
 * lee `public/icon-512.png` relativo al directorio de trabajo.
 */

const BASE_LOCAL = "http://localhost:3000";
const EXTENSIONES_VIDEO = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi"]);

/**
 * Valores de relleno para cuando lo que se está mirando es el diseño y no el
 * contenido. El titular es largo a propósito: es el caso que de verdad rompe
 * la plantilla, no uno corto.
 */
const TITULO_POR_DEFECTO =
  "Colombia y Venezuela reabren la frontera con un plan de comercio binacional";
const FUENTE_POR_DEFECTO = "lapatilla.com";

interface Opciones {
  archivo?: string;
  publicId?: string;
  tipo?: "imagen" | "video";
  titulo: string;
  fuente: string;
  segundo: number;
}

function leerOpciones(argv: string[]): Opciones {
  const opciones: Opciones = {
    titulo: TITULO_POR_DEFECTO,
    fuente: FUENTE_POR_DEFECTO,
    segundo: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const valor = argv[i + 1];
    switch (arg) {
      case "--public-id":
        opciones.publicId = valor;
        i += 1;
        break;
      case "--tipo":
        if (valor !== "imagen" && valor !== "video") {
          throw new Error("--tipo acepta 'imagen' o 'video'");
        }
        opciones.tipo = valor;
        i += 1;
        break;
      case "--titulo":
        opciones.titulo = valor;
        i += 1;
        break;
      case "--fuente":
        opciones.fuente = valor;
        i += 1;
        break;
      case "--segundo":
        opciones.segundo = Number(valor);
        if (!Number.isFinite(opciones.segundo)) throw new Error("--segundo acepta un número");
        i += 1;
        break;
      default:
        if (arg.startsWith("--")) throw new Error(`Opción desconocida: ${arg}`);
        opciones.archivo = arg;
    }
  }

  return opciones;
}

/** Mismo criterio que `/admin/noticia`: el tipo lo decide la extensión. */
function tipoPorExtension(archivo: string): "imagen" | "video" {
  return EXTENSIONES_VIDEO.has(path.extname(archivo).toLowerCase()) ? "video" : "imagen";
}

/**
 * Arma la URL firmada de la plantilla, igual que `armarUrlImagenFirmada()` en
 * `lib/publish-news.ts`: sin título la clave se omite del todo, porque la ruta
 * firma exactamente los parámetros que recibe.
 */
function urlPlantilla(params: { title?: string; image: string; source: string }): string {
  const firmados: Record<string, string> = params.title
    ? { title: params.title, image: params.image, source: params.source }
    : { image: params.image, source: params.source };

  const url = new URL(`${BASE_LOCAL}/api/og/instagram-post-news`);
  for (const [clave, valor] of Object.entries(firmados)) url.searchParams.set(clave, valor);
  url.searchParams.set("sig", signNewsImageParams(firmados));
  return url.toString();
}

function bloque(titulo: string, lineas: string[]): void {
  console.log(`--- ${titulo} ---`);
  for (const linea of lineas) console.log(linea);
  console.log();
}

function mostrarImagen(publicId: string, opciones: Opciones): void {
  const image = urlImagen(publicId);

  bloque("Imagen principal de post (con titular y fecha)", [
    urlPlantilla({ title: opciones.titulo, image, source: opciones.fuente }),
  ]);
  bloque("Imagen secundaria de carrusel (sin titular, foto más alta)", [
    urlPlantilla({ image, source: opciones.fuente }),
  ]);
  console.log("Las dos necesitan `npm run dev` levantado.");
  console.log("El marco se edita en app/api/og/instagram-post-news/route.tsx y lib/og-shared.ts;");
  console.log("recargar el navegador basta, no hace falta volver a correr este script.");
}

async function mostrarVideo(publicId: string, opciones: Opciones): Promise<void> {
  const formatos: Array<{ formato: FormatoVideo; titulo: string }> = [
    { formato: "carrusel", titulo: "Video como elemento de carrusel (1:1)" },
    { formato: "reel", titulo: "Video como Reel (9:16)" },
  ];

  for (const { formato, titulo } of formatos) {
    bloque(titulo, [
      `Video:     ${await urlVideoConMarca(publicId, formato, opciones.fuente)}`,
      `Fotograma: ${await urlFotogramaConMarca(publicId, formato, {
        segundo: opciones.segundo,
        fuente: opciones.fuente,
      })}`,
    ]);
  }

  if (opciones.fuente) {
    console.log('Con `--fuente ""` se ve la variante sin franja, que es la de material propio.');
  }

  console.log("Revisa el fotograma antes que el video: es inmediato y deja algo que comparar.");
  console.log("La marca se edita en lib/providers/cloudinary.ts; como la transformación viaja");
  console.log("en la URL, hay que volver a correr el script (con --public-id) tras cada cambio.");
}

async function main() {
  cargarEnvLocal();

  const opciones = leerOpciones(process.argv.slice(2));
  if (!opciones.archivo && !opciones.publicId) {
    console.error("Uso: npx tsx scripts/preview-marca.ts <archivo> [--titulo T] [--fuente F] [--segundo N]");
    console.error("     npx tsx scripts/preview-marca.ts --public-id <id> --tipo imagen|video");
    process.exit(1);
  }

  let publicId = opciones.publicId;
  let tipo = opciones.tipo;

  if (!publicId) {
    const archivo = opciones.archivo as string;
    tipo = tipo ?? tipoPorExtension(archivo);
    const subido = await subirMedia(await readFile(archivo), tipo === "video" ? "video" : "image");
    publicId = subido.publicId;
    console.log(`Subido a Cloudinary: ${publicId} (${Math.round(subido.bytes / 1024)} KB)`);
    console.log(`Reusa lo subido con: --public-id ${publicId} --tipo ${tipo}`);
    console.log();
  } else if (!tipo) {
    throw new Error("Con --public-id hace falta --tipo imagen|video");
  }

  if (tipo === "video") await mostrarVideo(publicId, opciones);
  else mostrarImagen(publicId, opciones);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
