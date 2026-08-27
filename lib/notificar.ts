/**
 * Los avisos por correo del sistema: un solo sitio, un solo transporte.
 *
 * Empezó siendo `lib/notificar-parada.ts`, que avisaba de una sola cosa —el
 * borrador nuevo de La Parada— mientras los fallos de verdad seguían siendo
 * silenciosos: si el cron de las 9:00 no publicaba, uno se enteraba mirando
 * el feed. La sensación de "sistema que se cuida solo" viene sobre todo de
 * que avise antes de que lo notes tú, así que ahora todos los puntos donde
 * algo se queda a medias pasan por aquí.
 *
 * Reglas del módulo:
 *
 * - **Nunca lanza.** Un correo que no sale no puede convertir una
 *   publicación correcta en un error que invite a reintentar y duplique el
 *   post — el mismo criterio que ya rige `guardarEnlace()` y
 *   `calentarVideo()`. Quien llama no tiene que envolverlo en `try/catch`.
 * - **Sin configuración, no hace nada.** Sin `RESEND_API_KEY` o sin dirección
 *   de destino se omite en silencio: es un aviso de conveniencia, y todo lo
 *   que avisa sigue estando en `/admin` de todas formas.
 * - **Se avisa de lo que pide una persona, no de cada intento.** Los crons
 *   que reintentan solos (la cola de programadas, las tasas pendientes)
 *   avisan una vez cuando la espera deja de ser normal, no en cada vuelta:
 *   un correo cada dos minutos se convierte en ruido que se ignora, que es
 *   peor que no avisar.
 *
 * Usa la API HTTP de Resend por `fetch`, sin su SDK: es una sola llamada, y
 * el proyecto ya resuelve así lo equivalente con OpenRouter (`lib/ia.ts`) y
 * HeyGen (`lib/video-nube.ts`).
 */

const TIMEOUT_MS = 10_000;

/**
 * `NOTIFICAR_EMAIL` es la variable general; `NOTIFICAR_PARADA_EMAIL` se sigue
 * aceptando porque es la que ya estaba configurada cuando el único aviso era
 * el de La Parada — cambiar de nombre no puede dejar sin avisos a una
 * instalación que ya funcionaba.
 */
function destino(): string | undefined {
  return process.env.NOTIFICAR_EMAIL || process.env.NOTIFICAR_PARADA_EMAIL || undefined;
}

/** El enlace absoluto a una pantalla del panel, para poder pulsarlo desde el correo. */
export function enlaceAdmin(ruta: string): string {
  const siteUrl = process.env.SITE_URL;
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${ruta}` : ruta;
}

/**
 * Manda un aviso. Devuelve si llegó a enviarse, para quien quiera anotarlo,
 * pero nadie tiene que comprobarlo.
 */
export async function notificar(asunto: string, html: string): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const para = destino();
    if (!apiKey || !para) return false;

    const remitente = process.env.RESEND_FROM ?? "La Tasa <onboarding@resend.dev>";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: remitente, to: para, subject: asunto, html }),
    });

    return response.ok;
  } catch {
    // Ver la cabecera: un aviso que falla no puede romper lo que lo disparó.
    return false;
  }
}

/** El texto de un error, para meterlo en el cuerpo del correo sin adornos. */
function detalle(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Hay un borrador nuevo de "Dólar en La Parada" esperando revisión. Lo dispara
 * `app/api/cron/vigilar-parada` justo después de guardarlo — nunca antes,
 * para no avisar de un artículo que al final no se pudo scrapear.
 */
export function notificarParadaPendiente(titulo: string): Promise<boolean> {
  const enlace = enlaceAdmin("/admin/parada");
  return notificar(
    "Nuevo borrador: Dólar en La Parada",
    `<p>Se detectó un artículo nuevo: <strong>${titulo}</strong>.</p>` +
      `<p>Confirmá compra y venta y publicalo desde <a href="${enlace}">${enlace}</a>.</p>`,
  );
}

/**
 * El resumen del día. Es el único aviso que sale **aunque no pase nada**, y
 * por eso es el único que se manda a una hora fija en vez de en respuesta a
 * un fallo: su valor está justamente en llegar todos los días, para que un
 * día raro se note por contraste.
 */
export function notificarResumenDia(resumen: {
  fecha: string;
  publicaciones: string[];
  tasas: string[];
  sitio: string[];
  instagram: string[];
}): Promise<boolean> {
  const bloque = (titulo: string, lineas: string[]) =>
    lineas.length === 0
      ? ""
      : `<h3 style="margin:16px 0 4px">${titulo}</h3><ul>${lineas
          .map((linea) => `<li>${linea}</li>`)
          .join("")}</ul>`;

  const enlace = enlaceAdmin("/admin");

  return notificar(
    `La Tasa · resumen del ${resumen.fecha}`,
    bloque("Qué salió", resumen.publicaciones) +
      bloque("Cómo cerraron las tasas", resumen.tasas) +
      bloque("El sitio", resumen.sitio) +
      bloque("Instagram", resumen.instagram) +
      `<p style="margin-top:16px"><a href="${enlace}">Abrir el panel</a></p>`,
  );
}

/** El cron de tasas falló al publicar. Ocurre como mucho dos veces al día. */
export function notificarFalloPublicacion(
  momento: "manana" | "tarde" | undefined,
  error: unknown,
): Promise<boolean> {
  const cual = momento === "manana" ? "de la mañana" : momento === "tarde" ? "de la tarde" : "";
  const enlace = enlaceAdmin("/admin/hoy");
  return notificar(
    `No salió el post de tasas ${cual}`.trim(),
    `<p>El cron no pudo publicar el carrusel ${cual}.</p>` +
      `<p><strong>${detalle(error)}</strong></p>` +
      `<p>Se puede publicar a mano desde <a href="${enlace}">${enlace}</a>.</p>`,
  );
}

/**
 * El post del día lleva demasiado rato esperando a que respondan las fuentes.
 *
 * No es un fallo —el reintento cada dos minutos sigue en marcha— pero pasada
 * media hora deja de ser una espera normal y conviene mirarlo.
 */
export function notificarEsperaLarga(
  momento: "manana" | "tarde",
  minutos: number,
): Promise<boolean> {
  const cual = momento === "manana" ? "de la mañana" : "de la tarde";
  const enlace = enlaceAdmin("/admin/hoy");
  return notificar(
    `El post ${cual} lleva ${minutos} minutos esperando`,
    `<p>Alguna tasa base (dólar BCV, euro BCV o Binance) todavía no responde, así que el post ${cual} sigue sin publicarse.</p>` +
      `<p>El reintento automático continúa cada dos minutos. Si urge, se puede publicar con lo que haya desde <a href="${enlace}">${enlace}</a>.</p>`,
  );
}

/**
 * Una tasa se movió tanto respecto de la última publicada que no parece
 * mercado. El post no salió solo, a la espera de que la lectura siguiente lo
 * confirme o lo desmienta.
 */
export function notificarTasaAnomala(
  etiqueta: string,
  valor: string,
  referencia: string,
  variacion: string,
): Promise<boolean> {
  const enlace = enlaceAdmin("/admin/hoy");
  return notificar(
    `${etiqueta} se movió ${variacion}: el post quedó en espera`,
    `<p><strong>${etiqueta}</strong> pasó de ${referencia} a ${valor} (${variacion}) respecto de la última lectura publicada.</p>` +
      `<p>Un salto así casi siempre es un fallo de la fuente, así que el post del día no se publicó solo. Si la próxima lectura vuelve a la normalidad, sale automáticamente en un par de minutos.</p>` +
      `<p>Si el movimiento es real, publicá a mano desde <a href="${enlace}">${enlace}</a>.</p>`,
  );
}

/** Una publicación programada terminó en `fallida` y ya no se reintenta sola. */
export function notificarProgramadaFallida(resumen: string, error: string): Promise<boolean> {
  const enlace = enlaceAdmin("/admin/noticia");
  return notificar(
    "Una publicación programada falló",
    `<p><strong>${resumen}</strong> no llegó a publicarse.</p>` +
      `<p>${error}</p>` +
      `<p>Se puede reintentar o eliminar desde la cola en <a href="${enlace}">${enlace}</a>.</p>`,
  );
}

/**
 * El refresco del token de Instagram falló. Es el aviso más importante de
 * todos: si se repite varios días, el token caduca y deja de publicarse todo.
 */
export function notificarFalloToken(error: unknown): Promise<boolean> {
  const enlace = enlaceAdmin("/admin");
  return notificar(
    "No se pudo renovar el token de Instagram",
    `<p>El cron diario no consiguió refrescar el token.</p>` +
      `<p><strong>${detalle(error)}</strong></p>` +
      `<p>Si esto se repite, el token caducará y dejará de publicarse todo. Se puede renovar a mano desde <a href="${enlace}">${enlace}</a>.</p>`,
  );
}
