import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { ejecutarPublicacion } from "@/lib/publish-news";

/** Publica una noticia de autoría propia. Protegida por la cookie de sesión. */
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
    const { mediaId } = await ejecutarPublicacion({
      tipo: "manual",
      datos: { title, sourceHost, caption, imagenPublicId },
    });
    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar la noticia", error);
  }
}
