import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { publicarTasasDelDia } from "@/lib/publish-hoy";

/**
 * Publica el carrusel diario de tasas fuera del horario del cron, desde el
 * botón "Publicar ahora" de `/admin/hoy`. Protegida por la cookie de sesión,
 * como el resto de `/api/admin` — a diferencia del cron, que exige
 * `CRON_SECRET` porque cron-job.org no puede cargar la cookie del navegador.
 *
 * No pasa `momento`: `publicarTasasDelDia()` decide sola no archivar en
 * `historico_tasas` cuando no lo recibe, así un disparo a media hora
 * cualquiera no pisa el registro de la mañana o la tarde con una lectura que
 * no es ninguna de las dos.
 */
export const runtime = "nodejs";

/** Igual que el cron: crear el carrusel obliga a Meta a descargarse dos imágenes que se renderizan al vuelo. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    return apiError("Falta configurar SITE_URL", undefined, 500);
  }

  try {
    const { mediaId, enlace } = await publicarTasasDelDia(siteUrl);
    return apiJson({ ok: true, mediaId, enlace });
  } catch (error) {
    return apiError("No se pudo publicar el post de Instagram", error);
  }
}
