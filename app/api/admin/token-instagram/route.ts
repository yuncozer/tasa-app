import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { refrescarToken } from "@/lib/instagram-token";

/**
 * Renueva el token de Instagram desde el panel, sin esperar al cron.
 *
 * Existe por dos momentos concretos: **inicializar** la tabla la primera vez
 * —hasta que hay una fila, no se sabe cuándo caduca el token del entorno, así
 * que no hay fecha con la que decidir— y **rescatar** el caso de que el cron
 * diario lleve días fallando y la franja ámbar del panel esté avisando.
 *
 * Por eso fuerza el refresco (`refrescarToken(true)`) en vez de respetar el
 * umbral de veinte días: si alguien pulsa este botón es justamente porque no
 * quiere esperar. Renovar antes de tiempo no tiene coste — el token nuevo
 * vuelve a valer 60 días desde hoy.
 *
 * Protegida por la cookie de sesión, como el resto de `/api/admin`, y no por
 * `CRON_SECRET`: ese secreto nunca llega al navegador.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  try {
    const resultado = await refrescarToken(true);
    return apiJson({ ok: true, ...resultado }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo renovar el token de Instagram", error);
  }
}
