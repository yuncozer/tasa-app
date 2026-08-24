/**
 * Avisa por correo que hay un borrador nuevo de "Dólar en La Parada"
 * esperando revisión en `/admin/parada`. Lo dispara
 * `app/api/cron/vigilar-parada/route.ts` justo después de guardar el
 * borrador — nunca antes, para no avisar de un artículo que al final no se
 * pudo scrapear.
 *
 * Usa la API HTTP de Resend por `fetch`, sin su SDK: es una sola llamada, y
 * el proyecto ya resuelve así lo equivalente con OpenRouter (`lib/ia.ts`) y
 * HeyGen (`lib/video-nube.ts`).
 *
 * Sin `RESEND_API_KEY` o `NOTIFICAR_PARADA_EMAIL` configurados, se omite en
 * silencio: es un aviso de conveniencia, no un requisito — el borrador ya
 * quedó guardado y `/admin/parada` lo sigue mostrando igual sin el correo.
 */

const TIMEOUT_MS = 10_000;

export async function notificarParadaPendiente(titulo: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const destino = process.env.NOTIFICAR_PARADA_EMAIL;
  if (!apiKey || !destino) return;

  const siteUrl = process.env.SITE_URL;
  const enlaceAdmin = siteUrl ? `${siteUrl.replace(/\/$/, "")}/admin/parada` : "/admin/parada";
  const remitente = process.env.RESEND_FROM ?? "La Tasa <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remitente,
      to: destino,
      subject: "Nuevo borrador: Dólar en La Parada",
      html: `<p>Se detectó un artículo nuevo: <strong>${titulo}</strong>.</p><p>Confirmá compra y venta y publicalo desde <a href="${enlaceAdmin}">${enlaceAdmin}</a>.</p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend respondió ${response.status}: ${await response.text()}`);
  }
}
