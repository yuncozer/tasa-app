import { NextResponse } from "next/server";
import { COOKIE_SESION, crearTokenSesion, esContrasenaValida } from "@/lib/admin-session";

/**
 * Recibe el `<form>` de `/admin/login` (POST normal, sin JS) y pone la
 * cookie de sesión si la contraseña coincide. `303` en vez de `307`/`308`:
 * fuerza que el navegador siga el redirect con `GET`, no reenviando el
 * `POST` del formulario.
 */
export const runtime = "nodejs";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export async function POST(request: Request) {
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

  const response = NextResponse.redirect(new URL("/admin/noticia", request.url), { status: 303 });
  response.cookies.set(COOKIE_SESION, crearTokenSesion(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
  return response;
}
