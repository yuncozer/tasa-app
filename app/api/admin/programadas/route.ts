import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { cancelarProgramada, reprogramarPublicacion } from "@/lib/programadas";

/**
 * Lo que se puede hacer con una fila de la cola sin publicarla: cambiarle la
 * hora (`PATCH`) o quitarla (`DELETE`). Una `pendiente` que ya no se quiere, o
 * una `fallida` que ya se leyó y estorba. Sin esto, un error en la hora no
 * tendría arreglo desde el teléfono más que borrando y rehaciendo el post
 * entero, y una fallida se quedaría en la lista para siempre.
 *
 * No hay `GET`: la lista la lee la propia página en el servidor
 * (`app/admin/noticia/page.tsx`), y tras cancelar basta con `router.refresh()`.
 */
export const runtime = "nodejs";

/**
 * Mueve a otra hora una publicación que sigue en cola. Solo cambia la fecha: el
 * payload ya se congeló al programar y sigue sirviendo, así que no hay que
 * volver a materializar nada.
 *
 * La hora se valida igual que en `/api/admin/programar` —tiene que ser futura—
 * para no dejar una fila que el cron recoja en su siguiente pasada por haberla
 * puesto sin querer en el pasado.
 */
export async function PATCH(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return apiError("Falta el id", undefined, 400);

  const publicarEn = typeof body?.publicarEn === "string" ? new Date(body.publicarEn) : null;
  if (!publicarEn || Number.isNaN(publicarEn.getTime())) {
    return apiError("Falta una fecha de publicación válida", undefined, 400);
  }
  if (publicarEn.getTime() <= Date.now()) {
    return apiError("La fecha de publicación tiene que estar en el futuro", undefined, 400);
  }

  try {
    const movida = await reprogramarPublicacion(id, publicarEn.toISOString());
    if (!movida) {
      // O ya salió, o el worker la reclamó mientras se elegía la hora nueva.
      return apiError("Esa publicación ya no se puede reprogramar", undefined, 409);
    }
    return apiJson({ ok: true }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo cambiar la hora de la publicación", error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return apiError("Falta el id", undefined, 400);

  try {
    const borrada = await cancelarProgramada(id);
    if (!borrada) {
      // O ya salió, o el worker la tiene entre manos: en ninguno de los dos
      // casos conviene perder la fila, que es el único rastro de qué pasó.
      return apiError("Esa publicación ya no se puede quitar de la cola", undefined, 409);
    }
    return apiJson({ ok: true }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo quitar la publicación de la cola", error);
  }
}
