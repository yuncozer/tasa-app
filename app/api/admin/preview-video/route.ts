import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { leerMarcaVideo, previewNewsVideoPost } from "@/lib/publish-news";

/** Vista previa del video propio ya con la franja de marca de Cloudinary. */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const videoPublicId = typeof body?.videoPublicId === "string" ? body.videoPublicId : "";
  if (!videoPublicId) {
    return apiError("Falta videoPublicId", undefined, 400);
  }

  try {
    // `descargaUrl` va junto a `videoUrl`: es la misma pieza con `fl_attachment`,
    // y el formulario la necesita para el botón de descarga.
    const previa = await previewNewsVideoPost(videoPublicId, leerMarcaVideo(body));
    return apiJson(previa);
  } catch (error) {
    return apiError("No se pudo generar la vista previa del video", error);
  }
}
