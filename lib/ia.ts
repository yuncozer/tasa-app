import { quitarPieEnlaces } from "@/lib/caption";

/**
 * Cliente mínimo de OpenRouter, para la única cosa que la IA hace en este
 * proyecto: **redactar prosa alrededor de números que ya existen.**
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

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Los modelos gratuitos de OpenRouter aparecen, cambian de nombre y se retiran
 * sin aviso, así que la lista vive en el entorno y no en el código: cambiar de
 * modelo no puede exigir un despliegue. Estos son solo el punto de partida.
 */
const MODELOS_POR_DEFECTO = [
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-5.2:free",
];

/**
 * Un modelo gratuito colgado no puede comerse el presupuesto de la función.
 * Se aborta pronto y se pasa al siguiente de la lista.
 */
const TIMEOUT_MS = 20_000;

/** Si no hay clave, la app se comporta exactamente como antes de existir esto. */
export function iaDisponible(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function modelos(): string[] {
  const lista = process.env.OPENROUTER_MODELOS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return lista && lista.length > 0 ? lista : MODELOS_POR_DEFECTO;
}

/**
 * Deja un texto del modelo en condiciones de entrar en un caption.
 *
 * Quita las URLs a propósito: el pie de tres enlaces lo pone `conPieEnlaces()`
 * en un solo sitio (`lib/publish-news.ts`), y un enlace inventado —o el propio
 * pie repetido de memoria— rompería esa regla y mandaría al lector a cualquier
 * parte. Por lo mismo pasa por `quitarPieEnlaces()`.
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

async function pedirA(modelo: string, sistema: string, usuario: string, maxTokens: number): Promise<string | null> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: control.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // Las dos que OpenRouter pide para atribuir el tráfico a la aplicación.
        ...(process.env.SITE_URL ? { "HTTP-Referer": process.env.SITE_URL } : {}),
        "X-Title": "La Tasa",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        // Bajo a propósito: esto redacta un caption informativo sobre tasas de
        // cambio, no busca sorprender a nadie.
        temperature: 0.4,
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: usuario },
        ],
      }),
    });

    if (!response.ok) return null;

    const body = await response.json();
    const texto = body?.choices?.[0]?.message?.content;
    return typeof texto === "string" && texto.trim() ? texto : null;
  } catch {
    // Timeout, red caída o JSON inesperado: para el caller son el mismo caso.
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Pide un texto al primer modelo de la lista que responda.
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
}): Promise<string | null> {
  if (!iaDisponible()) return null;

  for (const modelo of modelos()) {
    const texto = await pedirA(modelo, opciones.sistema, opciones.usuario, opciones.maxTokens ?? 600);
    if (texto) return texto;
  }
  return null;
}
