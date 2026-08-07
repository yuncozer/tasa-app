import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { previewManualNewsPost } from "@/lib/publish-news";

/**
 * Vista previa de una noticia de autoría propia (sin URL de artículo): el
 * título, la fuente y el caption los escribe el usuario, la imagen ya fue
 * subida antes a Cloudinary vía `/api/admin/subir-media`.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const sourceHost = typeof body?.sourceHost === "string" ? body.sourceHost.trim() : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const imagenPublicId = typeof body?.imagenPublicId === "string" ? body.imagenPublicId : "";

  if (!title || !sourceHost || !caption || !imagenPublicId) {
    return apiError("Faltan título, fuente, caption o imagen", undefined, 400);
  }

  try {
    const { imageUrl } = previewManualNewsPost({ title, sourceHost, caption, imagenPublicId });
    return apiJson({ title, sourceHost, caption, imageUrl }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo generar la vista previa", error);
  }
}
