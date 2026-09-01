import { readFile } from "node:fs/promises";
import path from "node:path";
import { signNewsImageParams } from "../lib/news-signature";
import type { ProporcionCarrusel } from "../lib/publish-news";
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
 *   npx tsx scripts/preview-marca.ts foto.jpg    → marco principal y secundario
 *   npx tsx scripts/preview-marca.ts clip.mp4    → video en 1:1, 4:5 y Reel 9:16
 *   npx tsx scripts/preview-marca.ts --public-id <id> --tipo video
 *
 * Opciones: `--titulo`, `--fuente`, `--proporcion 1:1|4:5`, `--segundo N`,
 * `--desde N --hasta N`, `--sin-sello`.
 *
 * `--sin-sello` quita el sello superpuesto, que es el mismo interruptor que
 * `/admin/noticia` ofrece por clip: material que ya trae su propia marca de
 * agua no necesita la nuestra encima.
 *
 * `--titulo` y `--fuente` alimentan las dos mitades: en las imágenes son el
 * titular y el crédito del marco; en el video, el cintillo. Con
 * `--titulo "" --fuente ""` el video sale solo con el sello, que es como va el
 * material propio sin acreditar.
 *
 * `--desde`/`--hasta` acotan el cintillo a ese intervalo del video (en
 * segundos); sin ellos, dura todo el clip. `--segundo` es otra cosa: de qué
 * segundo se saca el fotograma de revisión, no tiene que ver con cuánto dura
 * el cintillo en pantalla.
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
  desde?: number;
  hasta?: number;
  sinSello: boolean;
  proporcion: ProporcionCarrusel;
}

function leerOpciones(argv: string[]): Opciones {
  const opciones: Opciones = {
    titulo: TITULO_POR_DEFECTO,
    fuente: FUENTE_POR_DEFECTO,
    segundo: 0,
    proporcion: "1:1",
    sinSello: false,
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
      case "--proporcion":
        if (valor !== "1:1" && valor !== "4:5") throw new Error("--proporcion acepta '1:1' o '4:5'");
        opciones.proporcion = valor;
        i += 1;
        break;
      case "--segundo":
        opciones.segundo = Number(valor);
        if (!Number.isFinite(opciones.segundo)) throw new Error("--segundo acepta un número");
        i += 1;
        break;
      case "--desde":
        opciones.desde = Number(valor);
        if (!Number.isFinite(opciones.desde)) throw new Error("--desde acepta un número");
        i += 1;
        break;
      case "--hasta":
        opciones.hasta = Number(valor);
        if (!Number.isFinite(opciones.hasta)) throw new Error("--hasta acepta un número");
        i += 1;
        break;
      case "--sin-sello":
        // Sin valor: es un interruptor, igual que en `/admin/noticia`.
        opciones.sinSello = true;
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
 *
 * `proporcion` va **siempre**, aunque sea la de por defecto: la ruta la mete en
 * el conjunto firmado en todos los casos, así que omitirla aquí invalidaría la
 * firma y devolvería 403.
 */
function urlPlantilla(params: {
  title?: string;
  image: string;
  source: string;
  proporcion: ProporcionCarrusel;
}): string {
  const { proporcion } = params;
  const firmados: Record<string, string> = params.title
    ? { title: params.title, image: params.image, source: params.source, proporcion }
    : { image: params.image, source: params.source, proporcion };

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
    urlPlantilla({ title: opciones.titulo, image, source: opciones.fuente, proporcion: opciones.proporcion }),
  ]);
  bloque("Imagen secundaria de carrusel (sin titular, foto más alta)", [
    urlPlantilla({ image, source: opciones.fuente, proporcion: opciones.proporcion }),
  ]);
  console.log("Las dos necesitan `npm run dev` levantado.");
  console.log("El marco se edita en app/api/og/instagram-post-news/route.tsx y lib/og-shared.ts;");
  console.log("recargar el navegador basta, no hace falta volver a correr este script.");
}

async function mostrarVideo(publicId: string, opciones: Opciones): Promise<void> {
  const formatos: Array<{ formato: FormatoVideo; titulo: string }> = [
    { formato: "carrusel", titulo: "Video como elemento de carrusel (1:1)" },
    { formato: "carrusel-4-5", titulo: "Video como elemento de carrusel (4:5)" },
    { formato: "reel", titulo: "Video como Reel (9:16)" },
  ];

  // El cintillo se pide con `--titulo`, igual que el titular del marco en las
  // imágenes: con `--titulo ""` sale la banda baja de solo crédito, y sin
  // ninguno de los dos el video va únicamente con el sello. `--hasta` sin
  // `--desde` arranca en el segundo 0, igual que en `ControlCintillo`.
  const marca = {
    titulo: opciones.titulo || undefined,
    fuente: opciones.fuente || undefined,
    inicio: opciones.hasta !== undefined ? opciones.desde : undefined,
    fin: opciones.hasta,
    sinSello: opciones.sinSello,
  };

  for (const { formato, titulo } of formatos) {
    bloque(titulo, [
      `Video:     ${await urlVideoConMarca(publicId, formato, marca)}`,
      `Fotograma: ${await urlFotogramaConMarca(publicId, formato, { segundo: opciones.segundo, ...marca })}`,
    ]);
  }

  if (opciones.fuente || opciones.titulo) {
    console.log('Con `--titulo "" --fuente ""` se ve la variante sin cintillo, la de material propio.');
  }

  console.log("Revisa el fotograma antes que el video: es inmediato y deja algo que comparar.");
  console.log("La marca se edita en lib/providers/cloudinary.ts; como la transformación viaja");
  console.log("en la URL, hay que volver a correr el script (con --public-id) tras cada cambio.");
}

async function main() {
  cargarEnvLocal();

  const opciones = leerOpciones(process.argv.slice(2));
  if (!opciones.archivo && !opciones.publicId) {
    console.error(
      "Uso: npx tsx scripts/preview-marca.ts <archivo> [--titulo T] [--fuente F] [--proporcion 1:1|4:5] [--segundo N] [--desde N --hasta N]",
    );
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
