import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { ejecutarPublicacion } from "@/lib/publish-news";
import { esUrlValida } from "@/lib/validar-url";

/**
 * Publica el post de noticia desde `/admin/noticia`. Protegida por la
 * cookie de sesión; internamente usa `CRON_SECRET` a través de
 * `publishNewsPost`, pero ese secreto nunca sale del servidor.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const url = body?.url;
  if (!esUrlValida(url)) {
    return apiError("Falta un url válido (http o https)", undefined, 400);
  }

  const caption = typeof body?.caption === "string" && body.caption.trim() ? body.caption : undefined;
  const imagenPropiaPublicId = typeof body?.imagenPublicId === "string" ? body.imagenPublicId : undefined;

  try {
    const { mediaId } = await ejecutarPublicacion({
      tipo: "articulo",
      url,
      caption,
      imagenPublicId: imagenPropiaPublicId,
    });
    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de la noticia", error);
  }
}
