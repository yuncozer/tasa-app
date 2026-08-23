import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { estadoRender } from "@/lib/video-nube";

/**
 * En qué anda un render encolado en la nube.
 *
 * La interfaz la llama cada pocos segundos. Devuelve solo el estado, **nunca la
 * URL firmada** de HeyGen: esa es efímera y no tiene por qué salir del
 * servidor, así que el video se pide siempre por `/api/admin/video/archivo`,
 * que exige la misma cookie de sesión. Mismo criterio que las credenciales de
 * Cloudinary, que tampoco llegan al navegador.
 */

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const renderId = request.nextUrl.searchParams.get("id");
  if (!renderId) return NextResponse.json({ error: "Falta el id del render" }, { status: 400 });

  try {
    const { estado, error } = await estadoRender(renderId);
    return NextResponse.json({ estado, error });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo consultar el render";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
