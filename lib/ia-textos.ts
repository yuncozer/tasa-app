import type { AlertaBrecha } from "@/lib/alerta-brecha";
import { HASHTAGS_NOTICIA } from "@/lib/caption";
import { redactar, sanearTextoIa } from "@/lib/ia";
import type { ReporteSemanal } from "@/lib/semanal";

/**
 * Lo que la IA sabe hacer en este proyecto, con sus instrucciones: tres textos
 * —el caption de una noticia y los párrafos de contexto del reporte semanal y
 * de la alerta de brecha— más la lectura de la pizarra de La Parada, que es
 * una **sugerencia** para el admin y no un dato (ver `sugerirCifrasParada`).
 *
 * Viven aparte del cliente (`lib/ia.ts`) por el mismo motivo que `lib/semanal.ts`
 * vive aparte de la ruta que dibuja su imagen: esto es criterio editorial y se va
 * a tocar mucho más que el transporte. Todos devuelven `null` cuando el modelo
 * no responde o cuando lo que devuelve no sirve, y quien los llama cae entonces a
 * la plantilla de `lib/caption.ts`.
 */

/** Tope de un caption de noticia. Instagram admite 2.200 caracteres; esto se lee. */
const MAX_CAPTION = 900;

/**
 * Tope del análisis semanal: son dos o tres frases, no un artículo. Se exporta
 * porque el route que publica vuelve a sanear con el mismo tope el texto que le
 * llega del navegador, y dos números distintos serían dos criterios distintos.
 */
export const MAX_ANALISIS = 400;

/**
 * Reglas comunes a los dos: son las mismas que ya cumplen las plantillas, dichas
 * en palabras. El límite de 125 caracteres de la primera línea no es un capricho
 * de estilo — es lo único que Instagram muestra antes del "más", el mismo motivo
 * por el que `titularSemanal()` existe.
 */
const VOZ = [
  "Escribes para La Tasa, un medio de tasas de cambio de la frontera colombo-venezolana.",
  "Español neutro, claro y sobrio. Se lee de pie, en un negocio y desde un teléfono.",
  "No inventes ningún dato que no esté en la información que recibes.",
  "No escribas enlaces, ni URLs, ni «link en la bio»: los enlaces los agrega la aplicación.",
  "No uses markdown (nada de asteriscos ni guiones bajos): Instagram no lo interpreta.",
  "No des consejos de inversión ni recomiendes comprar o vender.",
  "La primera línea debe tener menos de 125 caracteres: es lo único que se lee antes del «más».",
].join(" ");

/**
 * Caption de un post de noticia, para el botón "Redactar con IA" de
 * `/admin/noticia`. Sustituye a `buildNewsCaption()` solo si el admin lo pide y
 * lo aprueba: la plantilla sigue siendo lo que se muestra por defecto.
 *
 * Sirve para los dos modos del formulario —el artículo scrapeado y la noticia
 * de autoría propia— porque los dos acaban en lo mismo: un título, una fuente y
 * un cuerpo del que partir.
 */
export async function redactarCaptionNoticia(datos: {
  title: string;
  sourceHost: string;
  description?: string;
}): Promise<string | null> {
  const texto = await redactar({
    sistema: [
      VOZ,
      "Redactas el caption de un post de Instagram sobre una noticia.",
      "Empieza con 📰 seguido de un titular propio y breve.",
      "Después, dos o tres párrafos cortos que resuman lo esencial de la noticia.",
      "No agregues hashtags.",
      "Termina exactamente con la línea «Fuente: <dominio>», con el dominio que se te indica.",
    ].join(" "),
    usuario: [
      `Titular original: ${datos.title}`,
      `Fuente: ${datos.sourceHost}`,
      datos.description ? `Contenido del artículo:\n${datos.description}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTokens: 700,
  });

  if (texto === null) return null;
  const limpio = sanearTextoIa(texto, MAX_CAPTION);
  if (limpio === null) return null;

  // El crédito de la fuente no se deja al criterio del modelo: es el mismo dato
  // que `buildNewsCaption()` pone siempre, y sale del hostname de la URL que se
  // pidió publicar, nunca de lo que el artículo dice de sí mismo.
  const conFuente = limpio.includes(`Fuente: ${datos.sourceHost}`)
    ? limpio
    : `${limpio}\n\nFuente: ${datos.sourceHost}`;

  // Y los hashtags tampoco, por lo mismo: el prompt le pide al modelo que no
  // los ponga —`sanearTextoIa` cortaría el texto ahí si lo hiciera— y se
  // añaden aquí, de modo que el caption de la IA cierre igual que el de
  // plantilla. Sin esto, usar el botón de redactar dejaba el post sin ellos.
  return `${conFuente}\n\n${HASHTAGS_NOTICIA}`;
}

/**
 * Párrafo de contexto para el caption del reporte semanal.
 *
 * Recibe las filas **ya calculadas** por `lib/semanal.ts` —las mismas que pintan
 * la imagen— y se le pide expresamente que **no repita cifras**: los números ya
 * van en las líneas de `buildCaptionSemanal()` y en la imagen, y repetirlos es la
 * vía más corta a que el mismo post acabe diciendo dos cosas distintas.
 *
 * Las dos aclaraciones del prompt no son decoración: sin la primera el modelo
 * lee los `pp` como porcentajes, y sin la segunda redacta una subida del dólar
 * como una buena noticia, que es lo contrario de lo que significa para quien lee.
 */
export async function redactarAnalisisSemanal(reporte: ReporteSemanal): Promise<string | null> {
  const filas = reporte.filas.map((fila) => ({
    concepto: fila.sujeto,
    valor: fila.valorTexto,
    direccion: fila.direccion,
    variacion: fila.variacion,
    unidad: fila.unidadVariacion === "puntos" ? "puntos porcentuales" : "por ciento",
  }));

  const texto = await redactar({
    sistema: [
      VOZ,
      "Redactas dos o tres frases de contexto para el resumen semanal de tasas.",
      "No repitas las cifras: ya aparecen en la imagen y en el resto del caption.",
      "Explica qué significa el movimiento para quien compra o vende en la frontera.",
      "Una tasa que sube significa que el bolívar o el peso perdieron valor: no lo presentes como algo positivo.",
      "Los «puntos porcentuales» son la diferencia entre dos porcentajes, no un cambio relativo.",
      "Si alguna fila no tiene comparación, no te inventes una tendencia para ella.",
      "Devuelve solo el párrafo, sin titular y sin encabezados.",
    ].join(" "),
    usuario: [`Semana: ${reporte.rangoTexto}`, `Datos: ${JSON.stringify(filas)}`].join("\n"),
    maxTokens: 300,
  });

  return texto === null ? null : sanearTextoIa(texto, MAX_ANALISIS);
}

/**
 * Párrafo de contexto para la alerta de brecha, el botón "Redactar análisis con
 * IA" de `/admin/brecha`.
 *
 * Es el tercer texto que la IA sabe redactar y sigue exactamente las mismas
 * reglas que los dos anteriores: prosa alrededor de cifras que ya están
 * calculadas, detrás de un botón, con una persona que lo lee antes de que salga.
 * La brecha la calcula `calcularBrecha()` y el titular lo decide la dirección
 * (`titularDe()` en `lib/alerta-brecha.ts`) — el modelo no toca ninguno de los
 * dos, que es justo lo que impide publicar un "aumenta" encima de unas cifras
 * que dicen lo contrario.
 *
 * Se le pasa `comparada` porque el prompt no puede ser el mismo en las dos
 * variantes: con "solo hoy" no hay movimiento del que hablar, y pedirle
 * contexto de una semana que nadie consultó es invitarle a inventarse una
 * tendencia.
 */
export async function redactarAnalisisBrecha(alerta: AlertaBrecha): Promise<string | null> {
  const comparando = alerta.comparada && alerta.direccion !== "desconocida";

  const texto = await redactar({
    sistema: [
      VOZ,
      "Redactas dos o tres frases de contexto para un post sobre la brecha entre el dólar oficial del BCV y el dólar de Binance.",
      "La brecha es cuánto se paga de más fuera de la tasa oficial.",
      "No repitas las cifras: ya aparecen en la imagen y en el resto del caption.",
      "Explica qué significa esa distancia para quien compra o vende en la frontera.",
      "Una brecha que crece significa que el bolívar se consigue más caro fuera del BCV: no lo presentes como algo positivo.",
      "Los «puntos porcentuales» son la diferencia entre dos porcentajes, no un cambio relativo.",
      comparando
        ? "Puedes mencionar la dirección del movimiento de esta semana, sin exagerarla."
        : "Este post habla solo del nivel de hoy: no menciones ninguna semana anterior ni afirmes que subió o bajó.",
      "Devuelve solo el párrafo, sin titular y sin encabezados.",
    ].join(" "),
    usuario: [
      `Brecha de hoy: ${alerta.brechaTexto}`,
      comparando
        ? `Hace una semana: ${alerta.brechaAntesTexto}. Dirección: ${alerta.direccion}. Variación: ${alerta.variacion} puntos porcentuales.`
        : "Sin comparación con la semana anterior.",
    ].join("\n"),
    maxTokens: 300,
  });

  return texto === null ? null : sanearTextoIa(texto, MAX_ANALISIS);
}

/**
 * Lo que la IA **sugiere** haber leído en la pizarra de la casa de cambio.
 *
 * No es un dato del proyecto: es una lectura de una foto que el admin tiene
 * que contrastar contra el artículo antes de teclear las cifras a mano. Por
 * eso el tipo se llama sugerencia y no cifras, y por eso `/admin/parada` la
 * enseña **al lado** de los campos y nunca dentro de ellos.
 */
export interface SugerenciaCifrasParada {
  compra: string | null;
  venta: string | null;
}

/**
 * Deja pasar solo lo que tiene forma de precio en pesos y descarta el resto.
 *
 * Es la guarda que hace sostenible pedirle cifras a un modelo: lo que vuelve
 * no se muestra tal cual, se comprueba. Cualquier explicación, unidad, rango o
 * texto de relleno se descarta entero en vez de intentar rescatarlo — "sin
 * dato no se inventa un dato" vale también para lo que dice una IA.
 */
function cifraParadaValida(valor: unknown): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const texto = String(valor).trim();
  // Solo dígitos con separadores de miles o decimales: "3.900", "3900",
  // "3.900,50". Nada de "≈3900", "3900 COP" ni "entre 3900 y 4000".
  if (!/^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?$|^\d+$/.test(texto)) return null;
  return texto;
}

/**
 * Le pide a un modelo con visión que lea la compra y la venta de la foto del
 * artículo, para **acompañar** —nunca sustituir— la confirmación a mano.
 *
 * Esto se acerca más que ningún otro uso de IA del proyecto a la regla de que
 * el modelo no toca una cifra, así que conviene decir con precisión por qué no
 * la rompe: lo que devuelve **no entra en `compra`/`venta`**, no se guarda en
 * Supabase, no llega a la imagen ni al caption y no habilita el botón de
 * publicar. Se dibuja al lado de los campos como una pista para quien está
 * mirando la pizarra en la foto, que es justo la tarea tediosa —leer cuatro
 * dígitos pequeños en un teléfono— y no la decisión. El admin sigue tecleando
 * las dos cifras, que es lo que `lib/parada.ts` exige desde el principio.
 *
 * Devuelve `null` si ningún modelo respondió, si no hay visión configurada o
 * si lo que devolvió no pasa `cifraParadaValida()`.
 */
export async function sugerirCifrasParada(imagenUrl: string): Promise<SugerenciaCifrasParada | null> {
  const texto = await redactar({
    sistema: [
      "Lees la pizarra de precios de una casa de cambio en la frontera colombo-venezolana.",
      "La foto muestra el precio de compra y de venta del dólar en pesos colombianos.",
      'Responde únicamente con JSON: {"compra": "3900", "venta": "3950"}.',
      "Usa null en el campo que no puedas leer con seguridad. No adivines.",
      "No escribas explicaciones, ni unidades, ni rangos, ni texto fuera del JSON.",
    ].join(" "),
    usuario: "¿Qué precio de compra y de venta del dólar se lee en esta imagen?",
    imagenUrl,
    maxTokens: 120,
  });

  if (!texto) return null;

  // El modelo suele envolver el JSON en prosa o en un bloque de markdown pese
  // a habérselo prohibido, así que se busca el objeto en vez de exigir que la
  // respuesta entera lo sea.
  const json = texto.match(/\{[^}]*\}/)?.[0];
  if (!json) return null;

  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof datos !== "object" || datos === null) return null;

  const compra = cifraParadaValida((datos as Record<string, unknown>).compra);
  const venta = cifraParadaValida((datos as Record<string, unknown>).venta);

  // Sin ninguna de las dos no hay nada que sugerir, y una tarjeta vacía al
  // lado del campo solo sería ruido.
  return compra || venta ? { compra, venta } : null;
}
