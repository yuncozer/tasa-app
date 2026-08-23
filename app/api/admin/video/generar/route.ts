import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { snapshotDelDia } from "@/lib/snapshot-hoy";
import { encolarRender, nubeConfigurada } from "@/lib/video-nube";
import { armarVariablesVideo, generarVideo, motivoNoDisponible } from "@/lib/video-tasas";

/**
 * Pone en marcha el render del Reel de tasas del día.
 *
 * Hay dos vías y se elige sola:
 *
 * - **Nube** (`modo: "nube"`), cuando están `HEYGEN_API_KEY` y
 *   `HYPERFRAMES_ASSET_ID`. Es la que funciona **desde el teléfono**, porque en
 *   Vercel no hay Chromium ni `ffmpeg`. Solo encola y devuelve el `renderId`:
 *   esperar el minuto que tarda no cabe en una función, así que la interfaz
 *   pregunta luego por `/api/admin/video/estado` — mismo criterio de avanzar
 *   por fases que la cola de programadas.
 * - **Local** (`modo: "local"`), corriendo la app en una máquina con el CLI y
 *   `ffmpeg`. Bloquea hasta terminar, que en desarrollo es más cómodo y no
 *   gasta créditos.
 *
 * Se prefiere la nube cuando está configurada para que lo que se prueba sea lo
 * que va a pasar en producción.
 */

export const maxDuration = 60;

export async function POST() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    if (nubeConfigurada()) {
      const snapshot = await snapshotDelDia();
      const renderId = await encolarRender(armarVariablesVideo(snapshot));
      return NextResponse.json({ modo: "nube", renderId });
    }

    const motivo = motivoNoDisponible();
    if (motivo) return NextResponse.json({ error: motivo }, { status: 503 });

    const { bytes, marca } = await generarVideo();
    return NextResponse.json({ modo: "local", bytes, marca });
  } catch (error) {
    // El mensaje viaja tal cual: le dice al admin si reintentar o si hay algo
    // que arreglar (falta una tasa, falta una credencial, HeyGen devolvió un
    // error), que es justo lo que un texto genérico le esconde.
    const mensaje = error instanceof Error ? error.message : "No se pudo generar el video";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
