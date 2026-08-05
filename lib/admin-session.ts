import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sesión de `/admin`: una sola contraseña (`ADMIN_PASSWORD`, distinta de
 * `CRON_SECRET` a propósito — son dos superficies de ataque separadas), sin
 * librería de sesiones. El token es la firma HMAC de un mensaje fijo, mismo
 * patrón que `lib/news-signature.ts`; no lleva expiración propia porque la
 * cookie ya expira sola por `Max-Age` (ver `app/api/admin/login/route.ts`).
 */

export const COOKIE_SESION = "la_tasa_admin";
const MENSAJE = "sesion-admin";

function contrasena(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("Falta configurar ADMIN_PASSWORD");
  return password;
}

export function crearTokenSesion(): string {
  return createHmac("sha256", contrasena()).update(MENSAJE).digest("base64url");
}

export function esContrasenaValida(password: string): boolean {
  const esperada = Buffer.from(contrasena());
  const recibida = Buffer.from(password);
  if (esperada.length !== recibida.length) return false;
  return timingSafeEqual(esperada, recibida);
}

export function esSesionValida(token: string | undefined): boolean {
  if (!token) return false;
  const esperado = Buffer.from(crearTokenSesion());
  const recibido = Buffer.from(token);
  if (esperado.length !== recibido.length) return false;
  return timingSafeEqual(esperado, recibido);
}
