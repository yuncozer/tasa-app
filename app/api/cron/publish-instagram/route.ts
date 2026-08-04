import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { buildCaption } from "@/lib/caption";
import { publishDailyPost } from "@/lib/instagram";
import { getRates } from "@/lib/rates";

/**
 * Dispara Vercel Cron (ver `vercel.json`) dos veces al día, hora de Caracas:
 * 9:00 am y 6:00 pm. Cada entrada de `vercel.json` llama a esta misma ruta
 * con `?momento=manana` o `?momento=tarde`, que es lo que decide el título
 * del caption — explícito en vez de inferirlo de la hora del reloj, así no
 * se rompe si algún día se cambian los horarios.
 *
 * A diferencia del resto de las rutas de la API, esta sí exige autenticación:
 * publica en una cuenta real y no debe poder dispararla cualquiera que
 * adivine la ruta.
 */
export const runtime = "nodejs";

function momentoDesdeQuery(request: NextRequest): "manana" | "tarde" | undefined {
  const valor = request.nextUrl.searchParams.get("momento");
  return valor === "manana" || valor === "tarde" ? valor : undefined;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("No autorizado", undefined, 401);
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    return apiError("Falta configurar SITE_URL", undefined, 500);
  }

  try {
    const snapshot = await getRates();
    const caption = buildCaption(snapshot, momentoDesdeQuery(request));
    const imageUrl = `${siteUrl}/api/og/instagram-post`;

    const { mediaId } = await publishDailyPost(imageUrl, caption);

    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de Instagram", error);
  }
}
