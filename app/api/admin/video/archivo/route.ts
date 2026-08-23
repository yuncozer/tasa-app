import { existsSync, readFileSync } from "node:fs";

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { estadoRender } from "@/lib/video-nube";
import { RUTA_VIDEO } from "@/lib/video-tasas";

/**
 * Sirve el MP4 generado, detrás de la cookie de sesión de `/admin`.
 *
 * Con `?id=<renderId>` lo trae de la nube: esta ruta resuelve la URL firmada de
 * HeyGen y hace de intermediaria, de modo que esa URL —efímera y sin sesión—
 * nunca llega al navegador. Sin `id`, sirve el archivo que dejó el render
 * local en `videos/tasas-del-dia/renders/`, fuera de `public/`: escribir ahí en
 * tiempo de ejecución dejaría el video accesible sin sesión, y en Vercel ni
 * siquiera se puede.
 *
 * Con `?descargar=1` responde con `Content-Disposition: attachment`. Va por
 * cabecera y no con el atributo `download` de HTML por el mismo motivo que la
 * descarga de la vista previa de noticias: en iOS ese atributo es poco fiable,
 * y el admin trabaja desde el teléfono.
 */

export const maxDuration = 60;

function nombreDescarga(): string {
  // La fecha del nombre es la del día en que se descarga, que es cuando se va
  // a subir. No sale del video porque el archivo no la lleva dentro.
  const hoy = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `la-tasa-${hoy}.mp4`;
}

function cabeceras(bytes: number, descargar: boolean): Record<string, string> {
  return {
    "Content-Type": "video/mp4",
    "Content-Length": String(bytes),
    // Nunca en caché: el archivo se sobreescribe en cada generación, y una
    // copia vieja servida como nueva es justo lo que hay que evitar.
    "Cache-Control": "no-store",
    ...(descargar ? { "Content-Disposition": `attachment; filename="${nombreDescarga()}"` } : {}),
  };
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const descargar = request.nextUrl.searchParams.get("descargar") === "1";
  const renderId = request.nextUrl.searchParams.get("id");

  if (renderId) {
    try {
      const { estado, videoUrl, error } = await estadoRender(renderId);
      if (estado !== "listo" || !videoUrl) {
        return NextResponse.json(
          { error: error ?? "El video todavía no está listo" },
          { status: estado === "pendiente" ? 409 : 500 },
        );
      }

      const remoto = await fetch(videoUrl, { cache: "no-store" });
      if (!remoto.ok) {
        return NextResponse.json({ error: "No se pudo descargar el video de HeyGen" }, { status: 502 });
      }

      const datos = new Uint8Array(await remoto.arrayBuffer());
      return new NextResponse(datos, { headers: cabeceras(datos.byteLength, descargar) });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "No se pudo traer el video";
      return NextResponse.json({ error: mensaje }, { status: 500 });
    }
  }

  if (!existsSync(RUTA_VIDEO)) {
    return NextResponse.json({ error: "Todavía no hay ningún video generado" }, { status: 404 });
  }

  const datos = readFileSync(RUTA_VIDEO);
  return new NextResponse(new Uint8Array(datos), { headers: cabeceras(datos.byteLength, descargar) });
}
