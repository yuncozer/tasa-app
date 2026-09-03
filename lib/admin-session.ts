import { createHmac } from "node:crypto";
import { sonIguales } from "@/lib/comparar";

/**
 * Sesión de `/admin`: una sola contraseña (`ADMIN_PASSWORD`, distinta de
 * `CRON_SECRET` a propósito — son dos superficies de ataque separadas), sin
 * librería de sesiones.
 *
 * **El token lleva dentro cuándo se emitió y bajo qué versión**, y eso es lo
 * que lo hace revocable. Antes era la firma de un mensaje fijo, o sea el
 * mismo valor para siempre: `logout` borraba la cookie del navegador pero no
 * invalidaba nada, así que cualquier copia de ese valor —una captura, un
 * dispositivo prestado, un backup del perfil— seguía abriendo el panel hasta
 * que se cambiara `ADMIN_PASSWORD`. Detrás de esa cookie están los botones
 * que publican en la cuenta real, que es lo único del proyecto que no se
 * deshace.
 *
 * Ahora hay dos formas de cortar una sesión sin tocar la contraseña:
 *
 * - **Sola, a los 30 días.** La edad viaja firmada dentro del token, así que
 *   ya no depende de que el navegador respete el `Max-Age` de la cookie —
 *   ese lo controla quien la tenga, no nosotros.
 * - **Todas a la vez**, subiendo `SESSION_VERSION` en el entorno. Es el botón
 *   de pánico: un despliegue y ninguna cookie anterior vale.
 *
 * Formato: `<version>.<emitido en ms>.<firma>`, con la firma sobre las dos
 * primeras partes para que ninguna se pueda mover sin invalidar el conjunto.
 */

export const COOKIE_SESION = "la_tasa_admin";
const MENSAJE = "sesion-admin";

/** Vale 30 días, el mismo `Max-Age` que pone la cookie. */
export const MAX_EDAD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Se sube a mano para invalidar todas las sesiones abiertas. Sin definir vale
 * `1`, de modo que una instalación que no la configure se comporta igual.
 */
function version(): string {
  return process.env.SESSION_VERSION ?? "1";
}

function contrasena(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("Falta configurar ADMIN_PASSWORD");
  return password;
}

function firmar(version: string, emitido: number): string {
  return createHmac("sha256", contrasena())
    .update(`${MENSAJE}|${version}|${emitido}`)
    .digest("base64url");
}

export function crearTokenSesion(): string {
  const emitido = Date.now();
  const v = version();
  return `${v}.${emitido}.${firmar(v, emitido)}`;
}

export function esContrasenaValida(password: string): boolean {
  return sonIguales(contrasena(), password);
}

export function esSesionValida(token: string | undefined): boolean {
  if (!token) return false;

  const partes = token.split(".");
  if (partes.length !== 3) return false;

  const [v, emitidoTexto, firma] = partes;

  // Una sesión emitida bajo otra versión ya no vale, aunque su firma cuadre:
  // es justo el caso que `SESSION_VERSION` existe para cortar.
  if (v !== version()) return false;

  const emitido = Number(emitidoTexto);
  if (!Number.isSafeInteger(emitido)) return false;

  // El futuro también se rechaza: un token con fecha adelantada duraría más
  // de los 30 días, y solo puede salir de un reloj movido o de una firma
  // hecha con otra contraseña.
  const edad = Date.now() - emitido;
  if (edad < 0 || edad > MAX_EDAD_MS) return false;

  return sonIguales(firmar(v, emitido), firma);
}
