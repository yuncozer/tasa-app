import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { listarMedia } from "@/lib/providers/cloudinary";

/**
 * Lista lo ya subido a Cloudinary, para el selector "Elegir de la
 * biblioteca" de `/admin/noticia`: evita volver a subir un archivo que ya
 * está en la cuenta. Mismo guardián de sesión que el resto de rutas admin —
 * el navegador nunca habla con Cloudinary con nuestras credenciales, solo
 * con esta ruta y con `firmar-subida`.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const tipo = request.nextUrl.searchParams.get("tipo");
  if (tipo !== "image" && tipo !== "video") {
    return apiError("Falta el tipo (image o video)", undefined, 400);
  }
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;

  try {
    const pagina = await listarMedia({ tipo, cursor });
    return apiJson(pagina);
  } catch (error) {
    return apiError("No se pudo listar la biblioteca de Cloudinary", error);
  }
}
