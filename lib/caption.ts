import { enlaceWhatsapp } from "@/lib/atajos";
import { formatDate, formatRate, formatVariacion, vigenciaBcv } from "@/lib/format";
import { buildFilasPesos, type FilaPesosId } from "@/lib/pesos";
import type { ArticleData } from "@/lib/providers/news";
import type { FilaSemanal, FilaSemanalId, ReporteSemanal } from "@/lib/semanal";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/** El dominio propio, para los enlaces del pie de los captions. */
function sitioUrl(): string {
  const url = process.env.SITE_URL;
  if (!url) throw new Error("Falta configurar SITE_URL");
  return url;
}

/** Primera línea del pie: el marcador que permite quitarlo y reponerlo fresco. */
const MARCA_PIE = "📲 ¿Quieres ver la publicación de hoy con las tasas actualizadas?";

/**
 * El pie de enlaces que comparten el post diario y los de noticia: el post en
 * sí, la calculadora y el canal de WhatsApp. `destinoPost` es `/hoy` para el
 * diario y `/p/<slug>` para una noticia (ver `lib/enlaces.ts`) — en los dos
 * casos un atajo propio, nunca el permalink directo: ese no existe todavía
 * cuando se arma el caption, porque Instagram no lo asigna hasta publicar.
 *
 * El bloque del canal se omite si `ENLACE_WHATSAPP` no está configurado,
 * mismo criterio que ya usa `enlaceWhatsapp()` en `next.config.ts` — no
 * publicar un enlace que no lleva a ningún sitio.
 */
export function pieEnlaces(destinoPost: string): string {
  const sitio = sitioUrl();
  const canal = enlaceWhatsapp();

  const bloques = [
    `${MARCA_PIE}\n👉 ${destinoPost}`,
    `🧮 Calculadora de divisas completa:\n👉 ${sitio}`,
  ];
  if (canal) bloques.push(`📢 Únete a nuestro canal oficial de WhatsApp:\n👉 ${sitio}/wa`);

  return bloques.join("\n\n");
}

/**
 * El cuerpo de un caption sin su pie de enlaces, si lo tenía. La usa
 * `conPieEnlaces` para no ir acumulando pies, y `lib/canal-whatsapp.ts` para
 * partir de un post ya publicado (con su propio pie, apuntando a `/hoy` o
 * `/p/<slug>`) y armar el mensaje del canal con el permalink real en su
 * lugar.
 */
export function quitarPieEnlaces(caption: string): string {
  const bloques = caption.split("\n\n");
  const idx = bloques.findIndex((bloque) => bloque.startsWith(MARCA_PIE));
  return (idx === -1 ? bloques : bloques.slice(0, idx)).join("\n\n").trimEnd();
}

/**
 * Un caption con el pie de enlaces al final, quitando primero cualquier pie
 * anterior. Así se puede llamar sobre un caption ya publicado antes (al
 * reprogramar, por ejemplo) sin ir acumulando pies uno detrás de otro.
 */
export function conPieEnlaces(caption: string, destinoPost: string): string {
  const cuerpo = quitarPieEnlaces(caption);

  // Sin cuerpo —un caption vacío, o uno que era solo el pie de otro post—, no
  // se antepone una línea en blanco de más.
  return cuerpo ? `${cuerpo}\n\n${pieEnlaces(destinoPost)}` : pieEnlaces(destinoPost);
}

/**
 * Caption del post diario: plantilla fija, sin llamar a ningún API de IA.
 *
 * El post es un carrusel de dos diapositivas —las tasas en bolívares y las
 * mismas en pesos— y el caption es uno solo, el del contenedor padre. Por eso
 * lleva los dos bloques de cifras: la segunda diapositiva solo se ve si el
 * lector desliza, así que los números en pesos tienen que estar también aquí,
 * donde se pueden leer, copiar y buscar sin deslizar nada.
 *
 * El aviso legal no se repite aquí: Instagram trunca el caption a un tap de
 * "más" tras ~125 caracteres, así que meterlo ahí lo esconde justo lo
 * contrario de lo que busca un aviso obligatorio. Vive una sola vez,
 * completo y siempre visible, en la imagen del post.
 */

const FILAS: Array<{ key: RateKey; emoji: string; label?: string }> = [
  { key: "USD_BCV", emoji: "🇺🇸" },
  { key: "USD_BINANCE_BUY", emoji: "🟡", label: "Binance (Compra)" },
  { key: "USD_BINANCE_SELL", emoji: "🟡", label: "Binance (Venta)" },
  { key: "EUR_BCV", emoji: "🇪🇺" },
  { key: "COP_FRONTERA", emoji: "🇨🇴" },
];

const EMOJI_POR_FILA_PESOS: Record<FilaPesosId, string> = {
  TRM: "🇺🇸",
  FRONTERA_BUY: "🇺🇸",
  FRONTERA_SELL: "🇺🇸",
  VES_PROMEDIO: "🇻🇪",
};

/**
 * Etiqueta corta para el caption, cuando difiere de `fila.label` (el de la
 * imagen y el resto de la app). Solo las filas de frontera la llevan: sin
 * "Dólar" al frente y con la acción capitalizada.
 */
const LABEL_CAPTION_PESOS: Partial<Record<FilaPesosId, string>> = {
  FRONTERA_BUY: "Frontera (Compra)",
  FRONTERA_SELL: "Frontera (Venta)",
  VES_PROMEDIO: "Bolívar (Promedio)",
};

const SUBTITULO_POR_MOMENTO: Record<"manana" | "tarde", string> = {
  manana: "Actualización de la mañana",
  tarde: "Actualización de la tarde",
};

/**
 * El caption solo necesita decir "P2P" —el crédito completo ("Binance P2P
 * (USDT/COP)") vive en la imagen—, pero se deriva de `rate.source` en vez de
 * escribirse a mano: si el mercado de referencia cambiara de operador algún
 * día, esto no se queda diciendo "P2P" sobre una fuente que ya no lo es.
 */
function soloMercado(fuente: string): string {
  return fuente.includes("P2P") ? "P2P" : fuente;
}

/** Bloque de cifras de la primera diapositiva: todo en bolívares. */
function lineasEnBolivares(snapshot: RatesSnapshot): string[] {
  return FILAS.map(({ key, emoji, label }) => {
    const rate = snapshot.rates[key];
    const valor = rate.bsPerUnit === null ? "no disponible" : `${formatRate(rate.bsPerUnit)} Bs`;
    const esBcv = key === "USD_BCV" || key === "EUR_BCV";
    const vigencia = esBcv ? vigenciaBcv(rate.updatedAt) : undefined;
    // Igual que en la imagen: el peso frontera declara su fuente, porque su
    // nombre no la nombra y se leería como una tasa de las casas de cambio.
    const fuente = key === "COP_FRONTERA" ? soloMercado(rate.source) : undefined;
    return `* ${emoji} ${label ?? rate.label}: ${valor}${vigencia ? ` (${vigencia})` : ""}${fuente ? ` (${fuente})` : ""}`;
  });
}

/**
 * Bloque de cifras de la segunda diapositiva: todo en pesos. Las filas salen
 * de `buildFilasPesos` —las mismas que la imagen— para que caption e imagen no
 * puedan decir cosas distintas.
 */
function lineasEnPesos(snapshot: RatesSnapshot): string[] {
  return buildFilasPesos(snapshot).map((fila) => {
    const valor = fila.copPerUnit === null ? "no disponible" : `${formatRate(fila.copPerUnit)} COP`;
    const fuente = fila.fuente ? soloMercado(fila.fuente) : undefined;
    const label = LABEL_CAPTION_PESOS[fila.id] ?? fila.label;
    return `* ${EMOJI_POR_FILA_PESOS[fila.id]} ${label}: ${valor}${fuente ? ` (${fuente})` : ""}`;
  });
}

/**
 * Caption del post diario: plantilla fija, sin llamar a ningún API de IA.
 *
 * El pie enlaza tres sitios: el post del día (`/hoy`, no el permalink
 * directo — igual que ese atajo, se resuelve a mano después de publicar y
 * puede escribirse aquí antes de conocer el permalink), la calculadora y el
 * canal de WhatsApp. El de WhatsApp se omite si `ENLACE_WHATSAPP` no está
 * configurado, mismo criterio que ya usa `enlaceWhatsapp()` en `next.config.ts`
 * — no publicar un enlace que no lleva a ningún sitio.
 */
export function buildCaption(snapshot: RatesSnapshot, momento?: "manana" | "tarde"): string {
  const subtitulo = momento ? SUBTITULO_POR_MOMENTO[momento] : "Actualización del día";

  return [
    `📊 TASAS DE HOY | ${formatDate(snapshot.fetchedAt)} ☀️`,
    subtitulo,
    "",
    "🇻🇪 EN BOLÍVARES:",
    ...lineasEnBolivares(snapshot),
    "",
    "🇨🇴 EN PESOS COLOMBIANOS:",
    ...lineasEnPesos(snapshot),
    "",
    pieEnlaces(`${sitioUrl()}/hoy`),
  ].join("\n");
}

const HASHTAGS_SEMANAL =
  "#Venezuela #Colombia #DolarBCV #TasaDeCambio #Binance #TRM #PesoColombiano " +
  "#Cucuta #ResumenSemanal #LaTasaOnline";

const EMOJI_POR_FILA_SEMANAL: Record<FilaSemanalId, string> = {
  USD_BCV: "🇺🇸",
  BRECHA: "📊",
  TRM: "🇨🇴",
};

/** De dónde salen las tres cifras. En la imagen va en el pie; aquí, buscable y copiable. */
const FUENTES_SEMANAL = "Fuentes: BCV, Binance P2P y Banco de la República (TRM).";

/**
 * Con qué abre el caption.
 *
 * Instagram corta el texto tras ~125 caracteres, así que esa primera línea es
 * lo único que se lee sin pulsar "más": repetir ahí el titular que ya se lee
 * enorme en la imagen es desperdiciarla. Se abre con el movimiento más fuerte
 * de la semana.
 *
 * **Solo se comparan filas de la misma unidad.** Un 1,4 % y un 2,7 pp no son
 * magnitudes comparables —uno es un cambio relativo y el otro una diferencia
 * entre porcentajes—, así que la contienda es entre el dólar y la TRM, y la
 * brecha solo encabeza si es la única con comparación. Elegir por el número más
 * grande a secas haría ganar casi siempre a la brecha, que se mueve en una
 * escala distinta.
 *
 * Sin ninguna comparación se cae al titular de la imagen, que es lo único
 * cierto que queda por decir.
 */
function titularSemanal(reporte: ReporteSemanal): string {
  const conCambio = reporte.filas.filter((fila) => fila.direccion === "sube" || fila.direccion === "baja");
  const enPorcentaje = conCambio.filter((fila) => fila.unidadVariacion === "porcentaje");
  const candidatas = enPorcentaje.length > 0 ? enPorcentaje : conCambio;

  const destacada = candidatas.reduce<FilaSemanal | null>(
    (mejor, fila) => (mejor === null || Math.abs(fila.variacion!) > Math.abs(mejor.variacion!) ? fila : mejor),
    null,
  );

  if (!destacada) return `📈 Así se movieron las tasas esta semana (${reporte.rangoTexto})`;

  const verbo = destacada.direccion === "sube" ? "subió" : "bajó";
  const magnitud = formatVariacion(destacada.variacion, destacada.unidadVariacion);

  // El rango va entre paréntesis y no tras un guion: la frase ya lleva uno
  // dentro ("Lunes 10 — Domingo 16") y encadenar dos se lee fatal.
  return `📈 ${destacada.sujeto} ${verbo} ${magnitud} esta semana (${reporte.rangoTexto})`;
}

/**
 * Caption del reporte semanal.
 *
 * Consume las filas que ya armó `lib/semanal.ts` —las mismas que la imagen—
 * por el mismo motivo que `lineasEnPesos`: son el mismo post y no pueden acabar
 * diciendo cosas distintas. El aviso legal tampoco se repite aquí; vive
 * completo en la imagen.
 *
 * La flecha viaja en el texto y la magnitud llega ya en valor absoluto desde
 * `formatVariacion`, así que el signo se dice una sola vez.
 */
export function buildCaptionSemanal(reporte: ReporteSemanal): string {
  const lineas = reporte.filas.map((fila) => {
    const emoji = EMOJI_POR_FILA_SEMANAL[fila.id];
    const valor = fila.valor === null ? "no disponible" : fila.valorTexto;

    if (fila.direccion === "desconocida") {
      return `${emoji} ${fila.titulo}: ${valor} (sin comparación: aún no hay una semana de histórico)`;
    }

    if (fila.direccion === "igual") {
      return `${emoji} ${fila.titulo}: ${valor} (sin cambios en la semana)`;
    }

    const flecha = fila.direccion === "sube" ? "↑" : "↓";
    // La unidad se aclara pegada al número que la usa, y no en un párrafo
    // aparte: se explica una sola vez, donde de verdad se lee.
    const aclaracion = fila.unidadVariacion === "puntos" ? " —puntos porcentuales—" : "";

    return (
      `${emoji} ${fila.titulo}: ${valor} ` +
      `(${flecha} ${formatVariacion(fila.variacion, fila.unidadVariacion)}${aclaracion} en la semana)`
    );
  });

  return [
    titularSemanal(reporte),
    "",
    ...lineas,
    "",
    "Convierte cualquier monto en la calculadora completa: link en la bio.",
    "",
    FUENTES_SEMANAL,
    "",
    HASHTAGS_SEMANAL,
  ].join("\n");
}

/**
 * Cuerpo del caption de un post ocasional de noticia: plantilla fija, sin IA
 * — igual que `buildCaption`. El aviso legal tampoco se repite aquí por la
 * misma razón: ya vive completo en la imagen.
 *
 * No lleva el pie de enlaces ni slug propio: a diferencia del post diario
 * (que siempre enlaza a `/hoy`, conocido de antemano), una noticia necesita
 * un slug por post que solo existe una vez armado el `PublicacionPayload`
 * completo —con carrusel, reel o contenido propio pueden no venir de aquí en
 * absoluto—. Por eso el pie se agrega en un solo sitio para los cuatro casos:
 * `conEnlacePost()` en `lib/publish-news.ts`, justo antes de publicar o de
 * programar.
 */
export function buildNewsCaption(article: ArticleData): string {
  return [`📰 ${article.title}`, "", article.description, "", `Fuente: ${article.sourceHost}`].join("\n");
}
