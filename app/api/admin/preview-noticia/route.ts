import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { previewNewsPost, urlDescargaImagen } from "@/lib/publish-news";
import { esUrlValida } from "@/lib/validar-url";

/**
 * Vista previa del post de noticia para `/admin/noticia`: mismo resultado
 * que se publicaría, sin publicarlo. Protegida por la cookie de sesión, no
 * por `CRON_SECRET` — el navegador nunca ve ese secreto.
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

  const imagenPropiaPublicId = typeof body?.imagenPublicId === "string" ? body.imagenPublicId : undefined;

  try {
    const { article, caption, imageUrl } = await previewNewsPost(url, imagenPropiaPublicId);
    return apiJson(
      {
        title: article.title,
        sourceHost: article.sourceHost,
        caption,
        imageUrl,
        descargaUrl: urlDescargaImagen(imageUrl),
      },
    );
  } catch (error) {
    return apiError("No se pudo generar la vista previa del artículo", error);
  }
}
