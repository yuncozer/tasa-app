import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { subirMedia } from "@/lib/providers/cloudinary";

/**
 * Sube a Cloudinary una imagen o video que el usuario carga desde
 * `/admin/noticia` — contenido propio, no scrapeado. Protegida por la
 * cookie de sesión de `/admin`, igual que el resto de esa pantalla; las
 * credenciales de Cloudinary nunca salen del servidor.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const tipo = form?.get("tipo");

  if (!(archivo instanceof File) || (tipo !== "image" && tipo !== "video")) {
    return apiError("Falta el archivo o el tipo (image|video)", undefined, 400);
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const resultado = await subirMedia(buffer, tipo);
    return apiJson(resultado, { cachear: false });
  } catch (error) {
    return apiError("No se pudo subir el archivo", error);
  }
}
