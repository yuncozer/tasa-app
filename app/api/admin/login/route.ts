import { NextResponse } from "next/server";
import { COOKIE_SESION, crearTokenSesion, esContrasenaValida, MAX_EDAD_MS } from "@/lib/admin-session";
import { claveDeIp, limpiar, registrar } from "@/lib/limite-intentos";
import { avisarIntentosLogin } from "@/lib/notificar";

/**
 * Recibe el `<form>` de `/admin/login` (POST normal, sin JS) y pone la
 * cookie de sesión si la contraseña coincide. `303` en vez de `307`/`308`:
 * fuerza que el navegador siga el redirect con `GET`, no reenviando el
 * `POST` del formulario.
 *
 * **Los intentos se cuentan.** Es una sola contraseña delante de los botones
 * que publican en la cuenta real, y hasta aquí nada impedía probarlas todas:
 * ni un tope, ni una espera, ni un aviso — el ataque habría sido
 * completamente silencioso. El contador vive en memoria (ver
 * `lib/limite-intentos.ts` para lo que eso sí y no cubre) y un acceso
 * correcto lo borra, para que un despiste propio no deje la puerta cerrada
 * un cuarto de hora.
 */
export const runtime = "nodejs";

/** Cinco minutos tecleando mal es un despiste; diez veces en quince, no. */
const MAX_INTENTOS = 8;
const VENTANA_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const clave = claveDeIp(request, "login");
  const intento = registrar(clave, MAX_INTENTOS, VENTANA_MS);

  if (!intento.permitido) {
    // Se avisa **una sola vez** por ventana, no en cada intento bloqueado:
    // un correo por petición convertiría el propio aviso en el ataque.
    if (intento.primeraExcedida) await avisarIntentosLogin(intento.total, VENTANA_MS);
    return NextResponse.redirect(new URL("/admin/login?error=limite", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const password = formData.get("password");

  if (typeof password !== "string" || !password) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), { status: 303 });
  }

  let valido: boolean;
  try {
    valido = esContrasenaValida(password);
  } catch {
    valido = false;
  }

  if (!valido) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), { status: 303 });
  }

  limpiar(clave);

  const response = NextResponse.redirect(new URL("/admin/noticia", request.url), { status: 303 });
  response.cookies.set(COOKIE_SESION, crearTokenSesion(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // El token ya caduca solo por dentro: esto solo evita que el navegador
    // guarde una cookie que va a ser rechazada de todas formas.
    maxAge: Math.floor(MAX_EDAD_MS / 1000),
  });
  return response;
}
