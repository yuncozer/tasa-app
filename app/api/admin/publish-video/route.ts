import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { ejecutarPublicacion, leerMarcaVideo } from "@/lib/publish-news";

/** Publica el video propio (ya con marca) como Reel. Protegida por la cookie de sesión. */
export const runtime = "nodejs";

/**
 * Igual que los routes de cron: esperar a que Meta procese el video
 * consume bastante más que el tope por defecto de la función.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const videoPublicId = typeof body?.videoPublicId === "string" ? body.videoPublicId : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  if (!videoPublicId || !caption) {
    return apiError("Falta videoPublicId o caption", undefined, 400);
  }

  try {
    const { mediaId } = await ejecutarPublicacion({
      tipo: "reel",
      videoPublicId,
      caption,
      ...leerMarcaVideo(body),
    });
    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el video", error);
  }
}
