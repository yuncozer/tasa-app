import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { MAX_ELEMENTOS_CARRUSEL } from "@/lib/instagram";
import {
  leerElementosCarrusel,
  leerPrincipalCarrusel,
  leerProporcionCarrusel,
  previewCarouselPost,
} from "@/lib/publish-news";

/**
 * Vista previa del carrusel de `/admin/noticia`: las URLs reales de cada
 * elemento, sin publicar. Sirve además para ver antes de publicar que todos
 * quedan cuadrados, que es lo que Instagram exige de un carrusel.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const sourceHost = typeof body?.sourceHost === "string" ? body.sourceHost.trim() : "";
  const elementos = leerElementosCarrusel(body?.elementos);
  const principal = leerPrincipalCarrusel(body?.principal);
  const proporcion = leerProporcionCarrusel(body?.proporcion);

  // El título solo hace falta cuando el principal es una imagen.
  if (!sourceHost || !principal || !elementos || (principal.tipo !== "video" && !title)) {
    return apiError("Faltan título, fuente, elemento principal o elementos válidos", undefined, 400);
  }
  // +1 por el elemento principal, que no viene en la lista de elementos.
  if (elementos.length + 1 > MAX_ELEMENTOS_CARRUSEL) {
    return apiError(`Un carrusel admite como máximo ${MAX_ELEMENTOS_CARRUSEL} elementos`, undefined, 400);
  }

  try {
    const { elementos: resultado } = await previewCarouselPost({
      title: title || undefined,
      sourceHost,
      principal,
      elementos,
      proporcion,
    });
    return apiJson({ elementos: resultado });
  } catch (error) {
    return apiError("No se pudo generar la vista previa del carrusel", error);
  }
}
