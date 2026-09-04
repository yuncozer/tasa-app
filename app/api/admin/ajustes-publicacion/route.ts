import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { guardarAjusteDia, type ModoPublicacion } from "@/lib/ajustes-publicacion";
import { apiError, apiJson } from "@/lib/api";
import { fechaDeHoy } from "@/lib/tasas-pendientes";

/**
 * Guarda qué se publica en un disparo automático de **hoy**: completo, solo
 * las Historias, o nada.
 *
 * La fecha la pone el servidor con `fechaDeHoy()` y no viene del navegador:
 * este ajuste existe justamente para que caduque solo al terminar el día, y
 * aceptar una fecha arbitraria permitiría dejar apagado un día cualquiera del
 * futuro sin que nada lo recuerde.
 *
 * Protegida por la cookie de sesión, como el resto de `/api/admin`.
 */
export const runtime = "nodejs";

const MOMENTOS = ["manana", "tarde"] as const;
const MODOS = ["completo", "solo_carrusel", "solo_historias", "apagado"] as const;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  try {
    const { momento, modo } = await request.json();

    if (!MOMENTOS.includes(momento) || !MODOS.includes(modo)) {
      return apiError("Momento o modo no válido", undefined, 400);
    }

    await guardarAjusteDia(fechaDeHoy(), momento, modo as ModoPublicacion);
    return apiJson({ ok: true, momento, modo });
  } catch (error) {
    return apiError("No se pudo guardar el ajuste", error);
  }
}
