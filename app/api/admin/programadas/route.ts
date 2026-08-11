import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { cancelarProgramada, editarProgramada } from "@/lib/programadas";
import { leerPublicacionPayload, materializarParaProgramar } from "@/lib/publish-news";

/**
 * Lo que se puede hacer con una fila de la cola sin publicarla: cambiarle la
 * hora y/o el contenido (`PATCH`) o quitarla (`DELETE`). Una `pendiente` que ya
 * no se quiere, o una `fallida` que ya se leyó y estorba. Sin esto, un error en
 * la hora o en el contenido no tendría arreglo desde el teléfono más que
 * borrando y rehaciendo el post entero, y una fallida se quedaría en la lista
 * para siempre.
 *
 * No hay `GET` de la lista completa aquí: la lee la propia página en el
 * servidor (`app/admin/noticia/page.tsx`), y tras cancelar/editar basta con
 * `router.refresh()`. El `GET` de una fila concreta vive en `[id]/route.ts`,
 * y solo lo usa el formulario de edición para prellenarse.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Mueve a otra hora y/o cambia el contenido de una publicación que sigue en
 * cola. `payload` es opcional: "Cambiar hora" en la cola solo manda
 * `publicarEn`, y ahí el payload ya congelado sigue sirviendo tal cual. El
 * formulario de "Editar" manda ambos (o solo `payload`, si no se tocó la
 * hora).
 *
 * Si llega `payload`, se vuelve a pasar por `materializarParaProgramar`: para
 * `manual`/`reel` no hace nada, y para `carrusel` solo re-scrapea si el
 * principal sigue siendo un `articulo` sin resolver, algo que el formulario de
 * edición nunca produce porque siempre trabaja con `publicId`s ya resueltos.
 * Repetir el precalentado del video (`calentarVideo`, dentro de esa función)
 * tampoco tiene coste real: es un fetch de más, no una subida.
 */
export async function PATCH(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return apiError("Falta el id", undefined, 400);

  let publicarEn: string | undefined;
  if (body?.publicarEn !== undefined) {
    const fecha = new Date(body.publicarEn);
    if (Number.isNaN(fecha.getTime())) {
      return apiError("Falta una fecha de publicación válida", undefined, 400);
    }
    if (fecha.getTime() <= Date.now()) {
      return apiError("La fecha de publicación tiene que estar en el futuro", undefined, 400);
    }
    publicarEn = fecha.toISOString();
  }

  let payload;
  if (body?.payload !== undefined) {
    const leido = leerPublicacionPayload(body.payload);
    if (!leido) return apiError("Falta una publicación válida", undefined, 400);
    try {
      payload = await materializarParaProgramar(leido);
    } catch (error) {
      return apiError("No se pudo preparar la publicación editada", error);
    }
  }

  if (publicarEn === undefined && payload === undefined) {
    return apiError("No hay nada que cambiar", undefined, 400);
  }

  try {
    const movida = await editarProgramada(id, { publicarEn, payload });
    if (!movida) {
      // O ya salió, o el worker la reclamó mientras se editaba.
      return apiError("Esa publicación ya no se puede editar", undefined, 409);
    }
    return apiJson({ ok: true }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo guardar la publicación", error);
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
