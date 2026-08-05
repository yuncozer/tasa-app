import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de los parámetros de `app/api/og/instagram-post-news`.
 *
 * Esa ruta debe quedar sin autenticación para que Instagram la pueda
 * descargar, pero recibe título/imagen/fuente como texto libre en la query
 * string. Sin esto, cualquiera que la encuentre podría generar una imagen
 * con la marca de La Tasa y contenido arbitrario. Se firma con `CRON_SECRET`
 * (el mismo secreto que ya protege el disparo manual) para que solo quien
 * ya puede publicar en la cuenta pueda generar una firma válida.
 */

function ordenar(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function secreto(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("Falta configurar CRON_SECRET");
  return secret;
}

export function signNewsImageParams(params: Record<string, string>): string {
  return createHmac("sha256", secreto()).update(ordenar(params)).digest("base64url");
}

export function verifyNewsImageParams(params: Record<string, string>, signature: string): boolean {
  const esperada = Buffer.from(signNewsImageParams(params));
  const recibida = Buffer.from(signature);
  if (esperada.length !== recibida.length) return false;
  return timingSafeEqual(esperada, recibida);
}
