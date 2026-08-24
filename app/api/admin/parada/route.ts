import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { guardarCamposParada, leerParadaPendiente, LUGAR_PARADA_DEFECTO } from "@/lib/parada";

/**
 * Guarda lugar/compra/venta/caption del borrador de La Parada sin publicar
 * nada — lo usa el botón "Actualizar vista previa" de `/admin/parada`, para
 * que `/api/og/instagram-post-parada` (que lee estos campos directo de
 * Supabase, sin recibir nada por query string) refleje lo que el admin está
 * escribiendo antes de decidir publicar.
 */
export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const pendiente = await leerParadaPendiente().catch(() => null);
  if (!pendiente || pendiente.publicado) {
    return apiError("No hay ningún borrador de La Parada pendiente", undefined, 404);
  }

  const body = await request.json().catch(() => null);
  const lugar = typeof body?.lugar === "string" && body.lugar.trim() ? body.lugar.trim() : LUGAR_PARADA_DEFECTO;
  const compra = typeof body?.compra === "string" && body.compra.trim() ? body.compra.trim() : null;
  const venta = typeof body?.venta === "string" && body.venta.trim() ? body.venta.trim() : null;
  const caption = typeof body?.caption === "string" && body.caption.trim() ? body.caption : pendiente.caption;

  try {
    await guardarCamposParada({ lugar, compra, venta, caption });
    return apiJson({ ok: true }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo guardar el borrador", error);
  }
}
