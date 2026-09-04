import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { firmarSubidaDirecta } from "@/lib/providers/cloudinary";

/**
 * Emite el permiso con el que `/admin/noticia` sube una imagen o un video
 * **directamente** a Cloudinary, sin pasar el archivo por este servidor.
 *
 * Sustituye a `/api/admin/subir-media`, que recibía el archivo entero: en
 * Vercel el cuerpo de una petición a una función tope en unos 4,5 MB, así que
 * cualquier video de teléfono moría con un 413 de la plataforma —antes de
 * ejecutar una línea de código nuestro, y por tanto sin el mensaje de error
 * que esa ruta sabía dar.
 *
 * Sigue protegida por la cookie de sesión de `/admin`: lo que cambia es qué
 * viaja, no quién puede subir. `CLOUDINARY_API_SECRET` nunca sale de aquí — al
 * navegador solo baja una firma de un solo uso.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  try {
    return apiJson(firmarSubidaDirecta());
  } catch (error) {
    return apiError("No se pudo firmar la subida", error);
  }
}
