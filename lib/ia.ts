import { quitarPieEnlaces } from "@/lib/caption";

/**
 * Cliente mínimo de chat, para la única cosa que la IA hace en este proyecto:
 * **redactar prosa alrededor de números que ya existen.**
 *
 * Las cifras nunca salen de aquí. Las calculan `convert()`, `lib/pesos.ts` y
 * `lib/semanal.ts`, y el modelo solo escribe el texto que las acompaña. Tampoco
 * publica nada por su cuenta: se dispara al pulsar un botón en `/admin`, donde
 * lo que devuelve se ve y se edita antes de salir. Los crons —el post diario de
 * tasas y la cola de programadas— siguen siendo 100 % plantilla.
 *
 * Sin dependencias nuevas: es una llamada `fetch` a un endpoint compatible con
 * el formato de OpenAI, y el SDK no aportaría nada que no sea peso en el bundle.
 */

interface Proveedor {
  /** URL de chat completions, en formato OpenAI. */
  endpoint: string;
  /** Variable de entorno con su clave. Sin ella, el proveedor no se intenta. */
  clave: string;
}

/**
 * Los proveedores con tier gratuito que hablan el formato de OpenAI.
 *
 * Esto empezó clavado en OpenRouter, con la lista de modelos en el entorno y el
 * argumento de que «cambiar de modelo no puede exigir un despliegue». El mismo
 * argumento vale un escalón más arriba: los `:free` no solo se renombran, es que
 * el proveedor entero puede dejar de convenir —la cuota libre de OpenRouter es
 * la más estrecha de las tres, y eso no se sabía al escribir esto la primera
 * vez—. Cambiar de proveedor tampoco puede exigir un despliegue.
 *
 * El registro sí vive en el código porque es transporte y no política: son tres
 * URLs que solo cambian si el proveedor rompe su propia compatibilidad. Lo que
 * se elige desde el entorno es **cuáles se usan y en qué orden** (`IA_MODELOS`).
 *
 * Aviso que conviene no perder: el tier gratuito de Google declara que usa los
 * prompts para entrenar. Para lo que se redacta aquí —captions de cosas que van
 * a salir públicas en Instagram— da igual, pero no mandes por aquí nada que no
 * sea eso.
 */
const PROVEEDORES: Record<string, Proveedor> = {
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    clave: "OPENROUTER_API_KEY",
  },
  google: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    clave: "GOOGLE_AI_API_KEY",
  },
  groq: {
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    clave: "GROQ_API_KEY",
  },
};

/**
 * A qué proveedor va una entrada que no lo declara. Es lo que mantiene válido
 * el `OPENROUTER_MODELOS` de las instalaciones anteriores a este cambio: una
 * lista de modelos a secas se sigue leyendo como se leía.
 */
const PROVEEDOR_POR_DEFECTO = "openrouter";

interface Candidato {
  proveedor: string;
  modelo: string;
}

/**
 * Punto de partida, en orden de cuota: Google da 1.500 peticiones al día y Groq
 * 1.000, las dos solo con un correo; OpenRouter queda de tercero porque su tier
 * libre es el más estrecho. Son solo un default —los modelos gratuitos aparecen
 * y se retiran sin aviso— y un nombre que ya no exista simplemente falla y cae
 * al siguiente, que es el comportamiento de siempre.
 */
const CANDIDATOS_POR_DEFECTO: Candidato[] = [
  { proveedor: "google", modelo: "gemini-3.7-flash" },
  { proveedor: "groq", modelo: "openai/gpt-oss-120b" },
  { proveedor: "openrouter", modelo: "google/gemma-4-31b-it:free" },
  { proveedor: "openrouter", modelo: "openai/gpt-oss-20b:free" },
];

/**
 * Los candidatos que además **leen imágenes**, que son otra lista porque ser
 * gratis y entender una foto no van juntos: la mayoría de los `:free` son solo
 * de texto, y pedirle una imagen a uno de ellos no falla de forma limpia —
 * ignora la foto y responde igual, que es peor que no responder—.
 *
 * Por defecto solo Gemini, que es el que lo tiene en el plan libre con holgura.
 * Se cambia con `IA_MODELOS_VISION`, con el mismo formato `proveedor|modelo`.
 */
const CANDIDATOS_VISION_POR_DEFECTO: Candidato[] = [{ proveedor: "google", modelo: "gemini-3.7-flash" }];

/**
 * Un modelo gratuito colgado no puede comerse el presupuesto de la función.
 * Se aborta pronto y se pasa al siguiente de la lista.
 */
const TIMEOUT_MS = 20_000;

/**
 * Lee la lista del entorno.
 *
 * El separador es `|` y no `:` ni `/` porque los dos aparecen dentro de los
 * nombres de modelo (`google/gemma-4-31b-it:free`), así que partir por ellos
 * obligaría a adivinar dónde acaba el proveedor.
 *
 * `IA_MODELOS` manda; sin ella se lee `OPENROUTER_MODELOS`, que es lo que ya
 * estaba configurado en producción y sigue significando lo mismo.
 */
function candidatos(vision = false): Candidato[] {
  const crudo = vision ? process.env.IA_MODELOS_VISION : (process.env.IA_MODELOS ?? process.env.OPENROUTER_MODELOS);
  const entradas = crudo
    ?.split(",")
    .map((entrada) => entrada.trim())
    .filter(Boolean);

  if (!entradas || entradas.length === 0) return vision ? CANDIDATOS_VISION_POR_DEFECTO : CANDIDATOS_POR_DEFECTO;

  const lista: Candidato[] = [];
  for (const entrada of entradas) {
    const corte = entrada.indexOf("|");
    const proveedor = corte === -1 ? PROVEEDOR_POR_DEFECTO : entrada.slice(0, corte).trim();
    const modelo = corte === -1 ? entrada : entrada.slice(corte + 1).trim();

    if (!modelo) continue;
    if (!PROVEEDORES[proveedor]) {
      // Un nombre mal escrito en una variable de entorno no puede quedarse
      // mudo: el síntoma sería «ningún modelo respondió» sin nada que mirar.
      console.error(`[ia] proveedor desconocido en la lista: ${proveedor}`);
      continue;
    }
    lista.push({ proveedor, modelo });
  }

  return lista;
}

/** Los candidatos cuyo proveedor tiene clave configurada. El resto no se intenta. */
function candidatosUsables(vision = false): Candidato[] {
  return candidatos(vision).filter(({ proveedor }) => Boolean(process.env[PROVEEDORES[proveedor].clave]));
}

/**
 * Si no hay ninguna clave utilizable, la app se comporta exactamente como antes
 * de existir esto: los botones de «Redactar con IA» no se pintan.
 */
export function iaDisponible(): boolean {
  return candidatosUsables().length > 0;
}

/**
 * Lo mismo para lo que necesita leer una imagen. Es una pregunta aparte porque
 * la respuesta puede ser distinta: hay montajes con clave de un proveedor solo
 * de texto, y ahí el botón que lee una foto no debe pintarse — la misma regla
 * que "Pegar" o el botón de avisos, uno que nunca funciona es peor que ninguno.
 */
export function visionDisponible(): boolean {
  return candidatosUsables(true).length > 0;
}

/**
 * Deja un texto del modelo en condiciones de entrar en un caption.
 *
 * Quita las URLs a propósito: un enlace inventado por el modelo mandaría al
 * lector a cualquier parte, y el único pie con enlaces que existe lo arma
 * `formatMensajeCanal()` para el canal de WhatsApp, en un solo sitio. Por lo
 * mismo pasa por `quitarPieEnlaces()`, que además corta el bloque de hashtags
 * si el modelo lo puso pese a pedírsele que no: los hashtags se añaden después
 * (`lib/ia-textos.ts`), no se dejan a su criterio.
 *
 * Devuelve `null` si no queda nada, para que el caller caiga a la plantilla en
 * vez de publicar un hueco.
 */
export function sanearTextoIa(texto: string, maxLongitud: number): string | null {
  const limpio = quitarPieEnlaces(texto)
    .replace(/https?:\/\/\S+/gi, "")
    // El modelo devuelve markdown con frecuencia; el caption de Instagram no lo
    // interpreta y saldrían los asteriscos a la vista.
    .replace(/[*_`]/g, "")
    .split("\n")
    .map((linea) => linea.trimEnd())
    .join("\n")
    .trim();

  if (!limpio) return null;
  return limpio.length > maxLongitud ? `${limpio.slice(0, maxLongitud).trimEnd()}…` : limpio;
}

async function pedirA(
  candidato: Candidato,
  sistema: string,
  usuario: string,
  maxTokens: number,
  imagenUrl?: string,
): Promise<string | null> {
  const { proveedor, modelo } = candidato;
  const { endpoint, clave } = PROVEEDORES[proveedor];
  // Para los logs: el mismo nombre de modelo puede servirse desde dos
  // proveedores distintos, y saber cuál falló es la mitad del diagnóstico.
  const etiqueta = `${proveedor}|${modelo}`;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: control.signal,
      headers: {
        Authorization: `Bearer ${process.env[clave]}`,
        "Content-Type": "application/json",
        // Las dos que OpenRouter pide para atribuir el tráfico a la
        // aplicación. Solo se mandan ahí: en los demás no significan nada.
        ...(proveedor === "openrouter"
          ? {
              ...(process.env.SITE_URL ? { "HTTP-Referer": process.env.SITE_URL } : {}),
              "X-Title": "La Tasa",
            }
          : {}),
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        // Bajo a propósito: esto redacta un caption informativo sobre tasas de
        // cambio, no busca sorprender a nadie.
        temperature: 0.4,
        messages: [
          { role: "system", content: sistema },
          {
            role: "user",
            // Con imagen, el mensaje del usuario deja de ser una cadena y pasa
            // a ser la lista de partes del formato de OpenAI. El texto va
            // primero: es la instrucción sobre qué mirar en la foto.
            content: imagenUrl
              ? [
                  { type: "text", text: usuario },
                  { type: "image_url", image_url: { url: imagenUrl } },
                ]
              : usuario,
          },
        ],
      }),
    });

    if (!response.ok) {
      // `redactar()` sigue sin lanzar —el caller solo ve `null`—, pero sin
      // esto el motivo real (401 por clave inválida, 404 por política de
      // datos del modelo, 429 por cuota) se perdía por completo: no había
      // dónde mirarlo cuando "ningún modelo respondió" en /admin. Queda en
      // los logs de la función de Vercel, acotado para no volcar HTML entero
      // si OpenRouter responde con una página de error.
      const detalle = await response.text().catch(() => "");
      console.error(`[ia] ${etiqueta} respondió ${response.status}: ${detalle.slice(0, 300)}`);
      return null;
    }

    const body = await response.json();
    const texto = body?.choices?.[0]?.message?.content;
    return typeof texto === "string" && texto.trim() ? texto : null;
  } catch (error) {
    // Timeout, red caída o JSON inesperado: para el caller son el mismo caso,
    // pero también queda registrado para poder distinguirlos en los logs.
    console.error(`[ia] ${etiqueta} falló:`, error);
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Pide un texto al primer candidato de la lista que responda.
 *
 * La lista cruza proveedores, así que un Google caído a las once de la mañana
 * cae a Groq y luego a OpenRouter sin que nadie toque nada. Es la misma cascada
 * que ya existía entre modelos, un escalón más arriba.
 *
 * **Nunca lanza.** Devuelve `null` ante cualquier fallo —sin clave, 401, 429 por
 * cuota agotada del plan gratuito, timeout, respuesta vacía— y el caller cae a
 * la plantilla determinista. Es el mismo criterio de degradación que ya aplican
 * `destinoDeHoy()`, `construirReporteSemanal()` y `calentarVideo()`: lo que
 * había antes de la IA sigue siendo el camino que siempre funciona.
 *
 * Sin reintentos ni caché propios: esto se dispara al pulsar un botón, así que
 * el reintento es volver a pulsarlo, y así ninguna visita de un usuario de la
 * portada consume cuota.
 */
export async function redactar(opciones: {
  sistema: string;
  usuario: string;
  maxTokens?: number;
  /** Una foto que el modelo tiene que mirar. Cambia la lista de candidatos a la de visión. */
  imagenUrl?: string;
}): Promise<string | null> {
  for (const candidato of candidatosUsables(Boolean(opciones.imagenUrl))) {
    const texto = await pedirA(
      candidato,
      opciones.sistema,
      opciones.usuario,
      opciones.maxTokens ?? 600,
      opciones.imagenUrl,
    );
    if (texto) return texto;
  }
  return null;
}
