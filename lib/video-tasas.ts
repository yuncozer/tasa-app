import { execFileSync } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { brechaDelSnapshot } from "@/lib/brecha";
import { buildCaption } from "@/lib/caption";
import { formatClock, formatFechaLarga, horaCaracasDesdeIso } from "@/lib/format";
import { buildFilasPesos } from "@/lib/pesos";
import { leerSnapshotHoy } from "@/lib/snapshot-hoy";
import type { RatesSnapshot } from "@/lib/types";

/**
 * El Reel vertical de tasas del día: sus datos, y el render.
 *
 * Vive aquí y no dentro del script ni de la ruta porque lo usan los dos —
 * `scripts/video-tasas.ts` desde la terminal y `/admin/video` desde el
 * navegador—, y si cada uno armara sus variables por su cuenta el video
 * generado desde el teléfono podría no coincidir con el generado a mano. Es el
 * mismo criterio que `ejecutarPublicacion()`: una sola puerta.
 *
 * **Solo servidor.** Usa `node:child_process` y lee del disco; nunca debe
 * importarse desde un componente de cliente.
 */

/**
 * Las rutas se resuelven desde **este archivo**, no desde el directorio de
 * trabajo. Con rutas relativas, ejecutar el script desde otra carpeta no
 * fallaba: escribía las variables en otro sitio y se quedaba sin `.env.local`,
 * con lo que el snapshot publicado no se leía y el video salía con las tasas
 * del momento — cifras distintas de las del post, en silencio. Verificado:
 * desde `videos/` daba 913,12 donde el post decía 913,50.
 */
const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DIR_VIDEO = path.join(RAIZ_REPO, "videos", "tasas-del-dia");
export const RUTA_VARIABLES = path.join(DIR_VIDEO, "variables.json");
export const RUTA_VIDEO = path.join(DIR_VIDEO, "renders", "video.mp4");

/**
 * El snapshot exacto con el que se publicó el último post, o un error que dice
 * por qué no se pudo leer.
 *
 * **No usa `snapshotDelDia()` a propósito.** Aquella se traga el fallo de
 * Supabase y sigue con `getRates()`, que para la imagen de `/hoy` es la
 * degradación correcta —mejor una imagen algo desfasada que una rota—, pero
 * aquí sería el error que todo esto existe para evitar: el video saldría con
 * las tasas del momento y afirmaría cifras distintas de las que la gente ya
 * tiene en el feed, sin que nadie se entere. Y peor, el hueco reaparecía más
 * tarde como "falta la brecha", culpando al dato en vez de nombrar la causa.
 */
export async function snapshotPublicado(): Promise<RatesSnapshot> {
  let congelado: RatesSnapshot | null;

  try {
    congelado = await leerSnapshotHoy();
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No se pudo leer el snapshot del último post en Supabase (${detalle}). ` +
        `El video no cae a las tasas en vivo a propósito: diría cifras distintas ` +
        `de las del post. Reintenta en un momento.`,
    );
  }

  if (!congelado) {
    throw new Error(
      "Todavía no hay ningún post de tasas congelado: la tabla snapshot_hoy está vacía. " +
        "Sale con el cron de las 9:00 y el de las 18:00.",
    );
  }

  return congelado;
}

export interface ResumenTasas {
  /** El caption tal como salió publicado, reconstruido del mismo snapshot. */
  caption: string;
  /** Cuándo se capturaron las tasas, en ISO. */
  capturadoEn: string;
  /** "06:00 PM" — la hora de esa captura, en Caracas. */
  hora: string;
  momento: "manana" | "tarde";
}

/**
 * De qué mitad del día es este snapshot.
 *
 * `snapshot_hoy` guarda una sola fila que se sobreescribe, sin columna de
 * momento, así que se deduce de la hora de captura: los dos disparos del cron
 * son a las 9:00 y a las 18:00 de Caracas. Se pasa por
 * `horaCaracasDesdeIso()` en vez de restar el huso a mano, para que la
 * conversión siga viviendo en un solo sitio.
 */
export function momentoDelSnapshot(snapshot: RatesSnapshot): "manana" | "tarde" {
  const hora = Number(horaCaracasDesdeIso(snapshot.fetchedAt).slice(11, 13));
  return hora < 12 ? "manana" : "tarde";
}

/**
 * El resumen del último post de tasas: su caption y cuándo se publicó.
 *
 * El caption se reconstruye con `buildCaption()` sobre el snapshot congelado,
 * que es exactamente lo que hizo el cron — misma función, mismos números—, en
 * vez de pedírselo a la Graph API. Así esta pantalla no depende de que
 * Instagram responda para enseñar lo que ya se publicó.
 */
export async function resumenTasas(): Promise<ResumenTasas> {
  const snapshot = await snapshotPublicado();
  const momento = momentoDelSnapshot(snapshot);

  return {
    caption: buildCaption(snapshot, momento),
    capturadoEn: snapshot.fetchedAt,
    hora: formatClock(snapshot.fetchedAt),
    momento,
  };
}

/**
 * Se niega a seguir si falta una tasa, en vez de emitir un hueco.
 *
 * Aquí no vale la degradación a `Sin dato` que sí tienen la portada o el
 * reporte semanal: aquellas muestran un estado, y esto produce un archivo que
 * se sube a Instagram y no se puede corregir después.
 */
function exigir(valor: number | null, que: string): number {
  if (valor === null || !Number.isFinite(valor)) {
    throw new Error(`Falta ${que}: no se genera el video con un hueco.`);
  }
  return valor;
}

/**
 * Las variables que rellenan la plantilla.
 *
 * **Ninguna cifra se calcula aquí.** La brecha sale de `calcularBrecha()` y la
 * fila en pesos de `buildFilasPesos()`, que son las mismas que usan la portada,
 * el reporte semanal y el post diario. Si esto hiciera su propia cuenta, el
 * video podría publicar un porcentaje distinto del que la app lleva todo el día
 * enseñando en pantalla.
 */
export function armarVariablesVideo(snapshot: RatesSnapshot): Record<string, string | number> {
  const { rates } = snapshot;

  // El dólar frontera sale de `buildFilasPesos()` y no de una división a mano:
  // es la misma fila que publica la diapositiva de pesos del post diario, con
  // su etiqueta y su fuente. Se toma la VENTA, no el promedio de compra y
  // venta: promediarlos está prohibido en este proyecto, y una cifra suelta
  // tiene que nombrar un lado del mercado, igual que la brecha.
  const filaFrontera = buildFilasPesos(snapshot).find((f) => f.id === "FRONTERA_SELL");
  if (!filaFrontera) throw new Error("buildFilasPesos() no devolvió la fila de frontera (venta)");

  // La fecha y la hora salen del propio snapshot, no del reloj de la máquina:
  // lo que fecha el video es el instante en que se capturaron las tasas, que es
  // el que el lector puede contrastar con el post.
  const fecha = `${formatFechaLarga(snapshot.fetchedAt)} · ${formatClock(snapshot.fetchedAt)}`;

  const filas = [
    { label: rates.USD_BCV.label, fuente: rates.USD_BCV.source, unidad: "Bs", valor: rates.USD_BCV.bsPerUnit },
    {
      label: rates.USD_BINANCE_BUY.label,
      fuente: rates.USD_BINANCE_BUY.source,
      unidad: "Bs",
      valor: rates.USD_BINANCE_BUY.bsPerUnit,
    },
    {
      label: rates.USD_BINANCE_SELL.label,
      fuente: rates.USD_BINANCE_SELL.source,
      unidad: "Bs",
      valor: rates.USD_BINANCE_SELL.bsPerUnit,
    },
    {
      label: filaFrontera.label,
      fuente: filaFrontera.fuente ?? "",
      unidad: "COP",
      valor: filaFrontera.copPerUnit,
    },
  ];

  const variables: Record<string, string | number> = {
    fecha,
    brecha: exigir(brechaDelSnapshot(snapshot), "la brecha BCV/Binance"),
  };

  filas.forEach((f, i) => {
    const n = i + 1;
    variables[`fila${n}Label`] = f.label;
    variables[`fila${n}Fuente`] = f.fuente;
    variables[`fila${n}Unidad`] = f.unidad;
    variables[`fila${n}Valor`] = exigir(f.valor, `la tasa "${f.label}"`);
  });

  // Los dos extremos de la resta que da la brecha, con las etiquetas de la app:
  // el lector puede comprobar el porcentaje contra las filas de arriba.
  variables.brechaLabelA = rates.USD_BCV.label;
  variables.brechaValorA = exigir(rates.USD_BCV.bsPerUnit, "el dólar BCV");
  variables.brechaLabelB = "Binance venta";
  variables.brechaValorB = exigir(rates.USD_BINANCE_SELL.bsPerUnit, "el Binance venta");

  return variables;
}

/**
 * Por qué no se puede renderizar aquí, o `null` si sí se puede.
 *
 * El render local necesita el CLI de HyperFrames, su Chromium y `ffmpeg`, y los
 * tres corren en la máquina que sirve la app. En un despliegue serverless eso no
 * existe — es la misma razón por la que la marca de los videos se hace en
 * Cloudinary y no aquí.
 *
 * **El mensaje cambia según dónde corra**, y eso no es un adorno: en Vercel no
 * se puede instalar `ffmpeg`, así que decirle al admin que lo instale lo manda a
 * un callejón sin salida. Ahí el problema real es siempre el mismo —falta
 * configurar el render en la nube—, y eso es lo que tiene que leer.
 */
export function motivoNoDisponible(): string | null {
  // `VERCEL` la define la propia plataforma en todos sus entornos.
  if (process.env.VERCEL) {
    return (
      "El render en la nube no está configurado. Añade HEYGEN_API_KEY y " +
      "HYPERFRAMES_ASSET_ID en las variables de entorno de Vercel y vuelve a " +
      "desplegar. Aquí no se puede renderizar en local: una función serverless " +
      "no tiene Chromium ni ffmpeg."
    );
  }

  if (!existsSync(path.join(DIR_VIDEO, "index.html"))) {
    return (
      "No se encuentra la plantilla del video (videos/tasas-del-dia/index.html). " +
      "El render local necesita el repositorio completo en disco."
    );
  }

  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    return (
      "Falta ffmpeg en esta máquina, y el render local lo necesita para escribir " +
      "el MP4. Instálalo, o configura HEYGEN_API_KEY y HYPERFRAMES_ASSET_ID para " +
      "renderizar en la nube."
    );
  }

  return null;
}

/** Un render a la vez: son ~60 s de CPU y dos a la vez se pisan el archivo. */
let renderEnCurso = false;

export interface VideoGenerado {
  bytes: number;
  /** Marca de tiempo del archivo, para romper la caché del `<video>`. */
  marca: number;
}

/**
 * Escribe las variables del día y renderiza el MP4.
 *
 * Devuelve el tamaño y la marca del archivo; el archivo en sí lo sirve
 * `/api/admin/video/archivo`, que exige la misma cookie de sesión.
 */
export async function generarVideo(): Promise<VideoGenerado> {
  const motivo = motivoNoDisponible();
  if (motivo) throw new Error(motivo);

  if (renderEnCurso) {
    throw new Error("Ya hay un video generándose. Espera a que termine.");
  }
  renderEnCurso = true;

  try {
    const snapshot = await snapshotPublicado();
    writeFileSync(RUTA_VARIABLES, `${JSON.stringify(armarVariablesVideo(snapshot), null, 2)}\n`, "utf8");

    // Orden única y no un array de argumentos: en Windows `npx` es un `.cmd`,
    // que Node se niega a lanzar sin shell, y pasar un array *con* shell
    // concatena sin escapar (DEP0190 de Node). Aquí no hay nada que escapar —
    // son constantes de este archivo.
    execFileSync(
      "npx hyperframes render . --skill=motion-graphics -q high " +
        "--variables-file variables.json -o ./renders/video.mp4",
      { cwd: DIR_VIDEO, stdio: "pipe", shell: true, timeout: 5 * 60_000 },
    );

    if (!existsSync(RUTA_VIDEO)) {
      throw new Error("El render terminó sin dejar el archivo en renders/video.mp4");
    }

    const info = statSync(RUTA_VIDEO);
    return { bytes: info.size, marca: info.mtimeMs };
  } finally {
    renderEnCurso = false;
  }
}
