import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { MAX_ELEMENTOS_CARRUSEL } from "@/lib/instagram";
import { ejecutarPublicacion, leerElementosCarrusel, leerPrincipalCarrusel } from "@/lib/publish-news";

/** Publica el carrusel desde `/admin/noticia`. Protegida por la cookie de sesión. */
export const runtime = "nodejs";

/**
 * Igual que los routes de cron: el carrusel puede llevar video, y esperar a
 * que Meta lo procese consume bastante más que el tope por defecto.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const sourceHost = typeof body?.sourceHost === "string" ? body.sourceHost.trim() : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const elementos = leerElementosCarrusel(body?.elementos);
  const principal = leerPrincipalCarrusel(body?.principal);

  if (!title || !sourceHost || !caption || !principal || !elementos) {
    return apiError("Faltan título, fuente, caption, imagen principal o elementos válidos", undefined, 400);
  }
  // +1 por la imagen principal, que no viene en la lista de elementos.
  if (elementos.length + 1 > MAX_ELEMENTOS_CARRUSEL) {
    return apiError(`Un carrusel admite como máximo ${MAX_ELEMENTOS_CARRUSEL} elementos`, undefined, 400);
  }

  try {
    const { mediaId } = await ejecutarPublicacion({
      tipo: "carrusel",
      datos: { title, sourceHost, principal, elementos },
      caption,
    });
    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el carrusel", error);
  }
}
