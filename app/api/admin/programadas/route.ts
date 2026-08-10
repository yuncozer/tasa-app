import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { cancelarProgramada } from "@/lib/programadas";

/**
 * Quita una publicación de la cola: una `pendiente` que ya no se quiere, o una
 * `fallida` que ya se leyó y estorba. Sin esto, un error en la hora no tendría
 * arreglo desde el teléfono, y una fallida se quedaría en la lista para
 * siempre.
 *
 * No hay `GET`: la lista la lee la propia página en el servidor
 * (`app/admin/noticia/page.tsx`), y tras cancelar basta con `router.refresh()`.
 */
export const runtime = "nodejs";

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
