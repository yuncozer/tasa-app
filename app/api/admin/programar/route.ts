import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { programarPublicacion } from "@/lib/programadas";
import { leerPublicacionPayload, materializarParaProgramar } from "@/lib/publish-news";

/**
 * Deja un post de `/admin/noticia` en cola para publicarse más tarde.
 * Protegida por la cookie de sesión, igual que las rutas de publicar.
 *
 * El post se **materializa aquí**, no en el worker: se resuelve el scraping y
 * la foto del artículo se copia a Cloudinary, de modo que lo que salga a la
 * hora indicada sea exactamente lo que se vio en la vista previa aunque el
 * portal cambie o se caiga mientras tanto.
 */
export const runtime = "nodejs";

/** Materializar implica scrapear y subir una imagen a Cloudinary. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const payload = leerPublicacionPayload(body?.payload);
  if (!payload) {
    return apiError("Falta una publicación válida", undefined, 400);
  }

  const publicarEn = typeof body?.publicarEn === "string" ? new Date(body.publicarEn) : null;
  if (!publicarEn || Number.isNaN(publicarEn.getTime())) {
    return apiError("Falta una fecha de publicación válida", undefined, 400);
  }
  if (publicarEn.getTime() <= Date.now()) {
    return apiError("La fecha de publicación tiene que estar en el futuro", undefined, 400);
  }

  try {
    const congelado = await materializarParaProgramar(payload);
    const programada = await programarPublicacion(publicarEn.toISOString(), congelado);
    return apiJson({ ok: true, id: programada.id }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo programar la publicación", error);
  }
}
