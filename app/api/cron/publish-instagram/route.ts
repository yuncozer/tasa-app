import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { buildCaption } from "@/lib/caption";
import { publishDailyPost } from "@/lib/instagram";
import { getRates } from "@/lib/rates";

/**
 * Dispara Vercel Cron (ver `vercel.json`) a las 9:00 am hora de Caracas.
 * A diferencia del resto de las rutas de la API, esta sí exige autenticación:
 * publica en una cuenta real y no debe poder dispararla cualquiera que
 * adivine la ruta.
 */
export const runtime = "nodejs";

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
    const caption = buildCaption(snapshot);
    const imageUrl = `${siteUrl}/api/og/instagram-post`;

    const { mediaId } = await publishDailyPost(imageUrl, caption);

    return apiJson({ ok: true, mediaId }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de Instagram", error);
  }
}
