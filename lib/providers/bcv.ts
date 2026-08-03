import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";

/**
 * Tasas oficiales del Banco Central de Venezuela.
 *
 * Fuente principal: la portada de bcv.org.ve, que publica USD, EUR, CNY, TRY y
 * RUB. Es la única fuente gratuita verificada que entrega el **euro oficial**;
 * las APIs de terceros que lo ofrecían pasaron a exigir registro o dejaron de
 * existir. El certificado TLS del BCV está vencido, así que la petición se hace
 * con un agente que no valida el certificado, acotado exclusivamente a ese host.
 *
 * Fuente de respaldo: ve.dolarapi.com, que solo publica el dólar oficial.
 */

const BCV_HOST = "www.bcv.org.ve";
const DOLARAPI_URL = "https://ve.dolarapi.com/v1/dolares/oficial";
const TIMEOUT_MS = 12_000;

export interface BcvRates {
  /** Bolívares por dólar. */
  usd: number;
  /** Bolívares por euro. `null` cuando solo se pudo usar el respaldo. */
  eur: number | null;
  /** Fecha valor publicada por el BCV (ISO 8601). */
  updatedAt: string | null;
  source: string;
  /** Por qué se usó el respaldo, cuando la fuente principal falló. */
  warning?: string;
}

/**
 * Abre el túnel `CONNECT` cuando el entorno define un proxy HTTPS. Node no
 * respeta `HTTPS_PROXY` por su cuenta, así que hay que establecer el socket a
 * mano; sin proxy configurado devuelve `null` y se conecta directo.
 */
function openProxyTunnel(): Promise<Socket | null> {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy) return Promise.resolve(null);

  const { hostname, port } = new URL(proxy);

  return new Promise((resolve, reject) => {
    const request = http.request({
      host: hostname,
      port: port || 80,
      method: "CONNECT",
      path: `${BCV_HOST}:443`,
      timeout: TIMEOUT_MS,
    });

    request.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`El proxy respondió ${response.statusCode} al conectar con el BCV`));
        return;
      }
      resolve(socket);
    });
    request.on("timeout", () => request.destroy(new Error("Proxy: tiempo agotado")));
    request.on("error", reject);
    request.end();
  });
}

/** Descarga la portada del BCV ignorando su certificado vencido. */
async function fetchBcvHtml(): Promise<string> {
  const socket = await openProxyTunnel();

  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        host: BCV_HOST,
        servername: BCV_HOST,
        path: "/",
        // El certificado del BCV está vencido; se acepta solo para este host.
        rejectUnauthorized: false,
        timeout: TIMEOUT_MS,
        ...(socket ? { socket, agent: false } : {}),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LaTasa/1.0)",
          Accept: "text/html",
        },
      },
      (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          response.resume();
          reject(new Error(`BCV respondió ${response.statusCode}`));
          return;
        }
        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      },
    );

    request.on("timeout", () => request.destroy(new Error("BCV: tiempo agotado")));
    request.on("error", reject);
  });
}

/**
 * Extrae el valor de un bloque como
 * `<div id="dolar" ...>…<strong class="strong-tb">748,78640000</strong>…</div>`.
 *
 * Se ancla en el primer `<strong>` que sigue al identificador —el bloque tiene
 * divs anidados, así que buscar su cierre no sirve— y traduce el formato
 * venezolano (punto de miles, coma decimal) a número.
 */
function parseCurrency(html: string, id: string): number | null {
  const match = new RegExp(
    `id="${id}"[\\s\\S]{0,800}?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`,
    "i",
  ).exec(html);
  if (!match) return null;

  const value = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Lee la "Fecha Valor" que el BCV publica junto a las tasas. */
function parseValueDate(html: string): string | null {
  const match = /Fecha Valor:[\s\S]{0,200}?content="([^"]+)"/i.exec(html);
  if (!match) return null;

  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchFromSite(): Promise<BcvRates> {
  const html = await fetchBcvHtml();
  const usd = parseCurrency(html, "dolar");
  const eur = parseCurrency(html, "euro");

  if (usd === null) throw new Error("BCV: no se encontró la tasa del dólar en el HTML");

  return { usd, eur, updatedAt: parseValueDate(html), source: "BCV" };
}

async function fetchFromDolarApi(): Promise<BcvRates> {
  const response = await fetch(DOLARAPI_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DolarAPI respondió ${response.status}`);

  const data = (await response.json()) as {
    promedio?: number;
    fechaActualizacion?: string;
  };
  if (typeof data.promedio !== "number") {
    throw new Error("DolarAPI: respuesta sin tasa promedio");
  }

  return {
    usd: data.promedio,
    eur: null,
    updatedAt: data.fechaActualizacion ?? null,
    source: "BCV · vía DolarAPI",
  };
}

/** Intenta el sitio del BCV y cae al respaldo si falla. */
export async function fetchBcvRates(): Promise<BcvRates> {
  try {
    return await fetchFromSite();
  } catch (siteError) {
    const reason = siteError instanceof Error ? siteError.message : String(siteError);
    try {
      const fallback = await fetchFromDolarApi();
      // Se conserva el motivo del fallo: es la única pista de por qué falta el euro.
      return { ...fallback, warning: `bcv.org.ve no respondió (${reason})` };
    } catch {
      throw siteError;
    }
  }
}
