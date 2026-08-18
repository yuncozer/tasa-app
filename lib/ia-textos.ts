import { redactar, sanearTextoIa } from "@/lib/ia";
import type { ReporteSemanal } from "@/lib/semanal";

/**
 * Los dos textos que la IA sabe redactar en este proyecto, con sus
 * instrucciones.
 *
 * Viven aparte del cliente (`lib/ia.ts`) por el mismo motivo que `lib/semanal.ts`
 * vive aparte de la ruta que dibuja su imagen: esto es criterio editorial y se va
 * a tocar mucho más que el transporte. Los dos devuelven `null` cuando el modelo
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
  return limpio.includes(`Fuente: ${datos.sourceHost}`) ? limpio : `${limpio}\n\nFuente: ${datos.sourceHost}`;
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
