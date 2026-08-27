import type { AlertaBrecha } from "@/lib/alerta-brecha";
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
 * La línea con la que cierran las cifras antes del pie. La usan el post
 * diario y el reporte semanal —cada uno con su propio pie después— y
 * `quitarPieEnlaces` la reconoce como el otro punto de corte posible, junto a
 * `MARCA_PIE`.
 */
const LINEA_CALCULADORA = "Convierte cualquier monto en la calculadora completa: link en la bio.";

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
 * El cuerpo de un caption sin su pie, si lo tenía. La usa `conPieEnlaces`
 * para no ir acumulando pies, y `lib/canal-whatsapp.ts` para partir de un
 * post ya publicado y armar el mensaje del canal con el permalink real en su
 * lugar.
 *
 * Reconoce los tres cierres posibles, porque para el canal todos sobran igual
 * —lo que va en su lugar es el pie de tres enlaces, que en WhatsApp sí son
 * clicables—:
 *
 * - `MARCA_PIE`, el pie de tres enlaces, en los posts publicados antes de que
 *   las noticias dejaran de llevarlo.
 * - `LINEA_CALCULADORA`, el "link en la bio" del post diario y del semanal,
 *   que arrastra sus hashtags detrás.
 * - Un bloque de **hashtags**, que es como cierran ahora las noticias: los
 *   escribe el admin en `/admin/noticia`, o los pone `buildNewsCaption` en las
 *   scrapeadas.
 *
 * Corta desde el primero que encuentre. Que los hashtags se detecten por su
 * forma y no por una constante es a propósito: cada noticia lleva los suyos,
 * así que no hay texto fijo con el que comparar.
 */
function esBloqueDeHashtags(bloque: string): boolean {
  return bloque.startsWith("#") && !bloque.includes("\n");
}

export function quitarPieEnlaces(caption: string): string {
  const bloques = caption.split("\n\n");
  const idx = bloques.findIndex(
    (bloque) =>
      bloque.startsWith(MARCA_PIE) || bloque === LINEA_CALCULADORA || esBloqueDeHashtags(bloque),
  );
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
  FRONTERA_BUY: "Binance (Compra)",
  FRONTERA_SELL: "Binance (Venta)",
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
 * Los hashtags del pie del post diario en Instagram. Los enlaces del pie
 * compartido (`pieEnlaces`) no sirven ahí porque Instagram no los vuelve
 * clicables dentro del caption — por eso el post diario no lo usa, al
 * contrario que los de noticia. Va en su sitio, junto a `LINEA_CALCULADORA`
 * más abajo, y no en la sección del reporte semanal, porque son dos listas
 * distintas.
 */
const HASHTAGS_DIARIO =
  "#Venezuela #Colombia #DolarBCV #DolarParalelo #TasaDeCambio #Cucuta " +
  "#Binance #EuroVenezuela #TRM #PesoColombiano #LaTasaOnline";

/** El caption del post diario siempre arranca así, sin importar el momento. */
const INICIO_CAPTION_DIARIO = "📊 TASAS DE HOY";

/**
 * `true` si este caption es el del post diario de tasas (mañana, tarde o el
 * disparo manual sin momento) — nunca una noticia ni el reporte semanal, que
 * no empiezan así. La usa `formatMensajeCanal()` (`lib/canal-whatsapp.ts`)
 * para decidir si el enlace del canal apunta a `/hoy` en vez de al permalink.
 */
export function esCaptionDiario(caption: string): boolean {
  return caption.startsWith(INICIO_CAPTION_DIARIO);
}

/** Cuerpo del caption del post diario, sin pie: título, subtítulo y las dos listas de cifras. */
function cuerpoCaptionDiario(snapshot: RatesSnapshot, momento?: "manana" | "tarde"): string {
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
  ].join("\n");
}

/**
 * Caption del post diario que de verdad se publica en Instagram: plantilla
 * fija, sin llamar a ningún API de IA.
 *
 * El pie no lleva los tres enlaces de `pieEnlaces` —Instagram no los vuelve
 * clicables dentro del caption, así que ahí solo estorban— y en su lugar
 * cierra con "link en la bio" y los hashtags, que es lo que de verdad ayuda
 * al alcance de un post normal.
 *
 * `formatMensajeCanal` (`lib/canal-whatsapp.ts`) arma la versión para el
 * canal de WhatsApp a partir de este mismo caption ya publicado: le quita
 * este pie de hashtags —`quitarPieEnlaces` reconoce `LINEA_CALCULADORA` como
 * el otro punto de corte posible, junto a `MARCA_PIE`— y pone en su lugar el
 * pie de tres enlaces, que en WhatsApp sí son clicables.
 */
export function buildCaption(snapshot: RatesSnapshot, momento?: "manana" | "tarde"): string {
  return [
    cuerpoCaptionDiario(snapshot, momento),
    "",
    LINEA_CALCULADORA,
    "",
    HASHTAGS_DIARIO,
  ].join("\n");
}

const HASHTAGS_BRECHA =
  "#Venezuela #DolarBCV #Binance #BrechaCambiaria #TasaDeCambio #USDT #Dolar " +
  "#Cucuta #LaTasaOnline";

/**
 * Caption de la alerta de brecha.
 *
 * Consume la misma `AlertaBrecha` que pinta la imagen —una sola cuenta por
 * cifra, igual que el semanal con sus filas— y abre con el movimiento, que es
 * lo único que se lee sin pulsar "más": Instagram corta el texto a los ~125
 * caracteres, y repetir ahí el titular que ya se lee enorme en la imagen sería
 * desperdiciar la línea.
 *
 * Los `pp` se explican pegados a su propio número, por el mismo motivo que en
 * `buildCaptionSemanal`: se aclaran una sola vez, donde de verdad se leen.
 */
export function buildCaptionBrecha(alerta: AlertaBrecha): string {
  const flecha = alerta.direccion === "sube" ? "↑" : alerta.direccion === "baja" ? "↓" : "";
  const magnitud = formatVariacion(alerta.variacion, "puntos");

  // La unidad se aclara pegada al número que la usa, no en un párrafo aparte.
  const movimiento = `${magnitud} —puntos porcentuales—`;

  const apertura =
    alerta.direccion === "sube"
      ? `🚨 La brecha entre el dólar BCV y Binance subió ${movimiento} en una semana`
      : alerta.direccion === "baja"
        ? `📉 La brecha entre el dólar BCV y Binance bajó ${movimiento} en una semana`
        : alerta.direccion === "igual"
          ? "📊 La brecha entre el dólar BCV y Binance se mantuvo esta semana"
          : "📊 Así está hoy la brecha entre el dólar BCV y Binance";

  const comparacion =
    alerta.direccion === "desconocida"
      ? "🕒 Hace una semana: sin dato en el histórico (sin comparación)"
      : alerta.direccion === "igual"
        ? `🕒 Hace una semana: ${alerta.brechaAntesTexto} (sin cambios)`
        : `🕒 Hace una semana: ${alerta.brechaAntesTexto} (${flecha} ${magnitud})`;

  return [
    apertura,
    "",
    `📊 Brecha hoy: ${alerta.brechaTexto}`,
    comparacion,
    `🇺🇸 Dólar BCV: ${alerta.valorOficialTexto}`,
    `🟡 USDT Binance (venta): ${alerta.valorParaleloTexto}`,
    "",
    LINEA_CALCULADORA,
    "",
    FUENTES_BRECHA,
    "",
    HASHTAGS_BRECHA,
  ].join("\n");
}

/** De dónde salen las dos cifras y contra cuál se mide. En la imagen va en el pie; aquí, buscable. */
const FUENTES_BRECHA =
  "Fuentes: BCV y Binance P2P. La brecha se mide contra la venta de Binance, que es el lado " +
  "que responde a cuánto se paga de más.";

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
 * Mete el párrafo de análisis en su hueco: después de las cifras y antes de la
 * línea de la calculadora.
 *
 * Existe como función aparte —y no como un `if` dentro de `buildCaptionSemanal`—
 * porque el panel de `/admin/semanal` tiene que enseñar el caption exacto que se
 * va a publicar mientras se escribe, y ese panel recibe el caption ya compuesto
 * por el servidor. Con la inserción en dos sitios, la vista previa y lo
 * publicado podrían acabar colocando el párrafo en lugares distintos.
 */
export function conAnalisisSemanal(caption: string, analisis?: string): string {
  const contexto = analisis?.trim();
  if (!contexto) return caption;

  const idx = caption.indexOf(LINEA_CALCULADORA);
  if (idx === -1) return `${caption}\n\n${contexto}`;

  return `${caption.slice(0, idx)}${contexto}\n\n${caption.slice(idx)}`;
}

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
 *
 * `analisis` es el único texto de todo el caption que puede venir de la IA (ver
 * `lib/ia-textos.ts`), y entra en una posición fija: **después de las cifras**,
 * nunca entre ellas ni en el titular. Así el párrafo redactado no puede
 * desordenar ni contradecir lo que dicen las líneas, que salen de las mismas
 * filas que la imagen. Sin él, el caption sale byte a byte como siempre.
 */
export function buildCaptionSemanal(reporte: ReporteSemanal, analisis?: string): string {
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

  const base = [
    titularSemanal(reporte),
    "",
    ...lineas,
    "",
    LINEA_CALCULADORA,
    "",
    FUENTES_SEMANAL,
    "",
    HASHTAGS_SEMANAL,
  ].join("\n");

  return conAnalisisSemanal(base, analisis);
}

/**
 * Los hashtags con los que cierra una noticia. Son más generales que los del
 * post diario porque el tema cambia con cada artículo; los posts cuyo caption
 * se escribe a mano en `/admin/noticia` llevan los suyos, más pegados a la
 * noticia concreta.
 *
 * Se exporta para `lib/ia-textos.ts`, que los pone al final del caption que
 * redacta el modelo por el mismo motivo por el que le repone el crédito de la
 * fuente: no se dejan a su criterio, y así el caption de la IA cierra igual
 * que el de plantilla.
 */
export const HASHTAGS_NOTICIA = "#Venezuela #Colombia #Economía #Noticias #DolarBCV #LaTasaOnline";

/**
 * Caption de un post ocasional de noticia: plantilla fija, sin IA — igual que
 * `buildCaption`. El aviso legal tampoco se repite aquí por la misma razón:
 * ya vive completo en la imagen.
 *
 * Cierra con hashtags y **no** con el pie de tres enlaces, por el mismo motivo
 * que el post diario: Instagram no vuelve clicables los enlaces dentro del
 * caption, así que ahí solo ocupan sitio. El pie sigue existiendo para el
 * mensaje que se arma en `/admin/canal` (`formatMensajeCanal`), donde WhatsApp
 * sí los deja tocar, y allí se pone con el permalink real en vez de un atajo.
 */
export function buildNewsCaption(article: ArticleData): string {
  return [
    `📰 ${article.title}`,
    "",
    article.description,
    "",
    `Fuente: ${article.sourceHost}`,
    "",
    HASHTAGS_NOTICIA,
  ].join("\n");
}

/**
 * Cuentas de Instagram a las que se les acredita "Dólar en La Parada": el
 * portal y el reportero que lo firma la mayoría de los días. Van como
 * constantes y no se leen del artículo —lanacionweb no expone un identificador
 * de Instagram en sus meta tags—, así que si un día lo firma otra persona el
 * crédito queda incorrecto hasta que se edite a mano en `/admin/parada` antes
 * de publicar. Es el mismo trato que ya tiene cualquier borrador detectado por
 * un cron en este proyecto: se revisa, no se publica a ciegas.
 */
const FUENTE_PARADA = "@lanacionweb";
const REPORTERO_PARADA = "@ponchogocho";

const HASHTAGS_PARADA =
  "#LaParada #VillaDelRosario #Cúcuta #DolarHoy #Frontera #Peso #Colombia #SanAntonio #Tachira #LaTasaOnline";

/**
 * Caption del post de "Dólar en La Parada", la nota diaria de lanacionweb
 * sobre el cambio informal en la frontera de Cúcuta. Mismo criterio que
 * `buildNewsCaption` —plantilla fija, cuerpo scrapeado, sin IA— pero con un
 * crédito de fuente distinto: en vez del hostname, las dos cuentas de
 * Instagram a las que hay que citar.
 */
export function buildParadaCaption(article: ArticleData): string {
  return [
    `🇨🇴💵${article.title}`,
    "",
    article.description,
    "",
    `Fuente: ${FUENTE_PARADA} · Reportero: ${REPORTERO_PARADA}`,
    "",
    HASHTAGS_PARADA,
  ].join("\n");
}
