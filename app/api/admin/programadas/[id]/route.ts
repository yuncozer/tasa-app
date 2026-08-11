import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { leerProgramada } from "@/lib/programadas";

/**
 * Una fila concreta de la cola, con el payload completo. Solo la usa el
 * formulario de "Editar" para prellenarse: la lista de `/admin/noticia` sigue
 * mandando únicamente el `resumen` (ver `resumenPublicacion`), y pedir el
 * contenido entero de cada fila con solo pintar la cola sería llevar al
 * navegador mucho más de lo que la lista necesita mostrar.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const { id } = await params;

  try {
    const fila = await leerProgramada(id);
    if (!fila) return apiError("No existe esa publicación", undefined, 404);
    if (fila.estado !== "pendiente") {
      return apiError("Esa publicación ya no se puede editar", undefined, 409);
    }
    return apiJson({ id: fila.id, publicarEn: fila.publicar_en, payload: fila.payload }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo leer la publicación", error);
  }
}
