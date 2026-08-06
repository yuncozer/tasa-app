import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { buildCaption, buildPesosCaption } from "@/lib/caption";
import { publishDailyPost } from "@/lib/instagram";
import { getRates } from "@/lib/rates";

/**
 * Dispara Vercel Cron (ver `vercel.json`) dos veces al día, hora de Caracas:
 * 9:00 am y 6:00 pm. Cada entrada de `vercel.json` llama a esta misma ruta
 * con `?momento=manana` o `?momento=tarde`, que es lo que decide el título
 * del caption — explícito en vez de inferirlo de la hora del reloj, así no
 * se rompe si algún día se cambian los horarios.
 *
 * Cada disparo publica **dos** posts: las tasas en bolívares y las mismas
 * tasas en pesos. Van juntos en la misma invocación, y no en dos entradas de
 * cron aparte, por dos razones: comparten un único `getRates()`, de modo que
 * los dos posts de la mañana no pueden mostrar cifras distintas; y el plan
 * Hobby de Vercel solo admite dos entradas de cron en total.
 *
 * A diferencia del resto de las rutas de la API, esta sí exige autenticación:
 * publica en una cuenta real y no debe poder dispararla cualquiera que
 * adivine la ruta.
 */
export const runtime = "nodejs";

interface ResultadoPost {
  tipo: "bolivares" | "pesos";
  ok: boolean;
  mediaId?: string;
  error?: string;
}

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

  let snapshot;
  try {
    snapshot = await getRates();
  } catch (error) {
    return apiError("No se pudieron obtener las tasas para publicar", error);
  }

  const momento = momentoDesdeQuery(request);

  /**
   * Uno tras otro, no en paralelo: son dos publicaciones seguidas en la misma
   * cuenta y `publicarContenedor()` ya reintenta con esperas; lanzarlas a la
   * vez solo acerca el límite de peticiones de la Graph API.
   *
   * Y cada una con su propio try: si falla la segunda, la primera ya salió de
   * verdad. Responder con un error seco haría creer que no se publicó nada y
   * llevaría a redisparar el cron, duplicando el post que sí funcionó.
   */
  const posts: ResultadoPost[] = [];

  for (const { tipo, imageUrl, caption } of [
    { tipo: "bolivares" as const, imageUrl: `${siteUrl}/api/og/instagram-post`, caption: buildCaption(snapshot, momento) },
    { tipo: "pesos" as const, imageUrl: `${siteUrl}/api/og/instagram-post-pesos`, caption: buildPesosCaption(snapshot, momento) },
  ]) {
    try {
      const { mediaId } = await publishDailyPost(imageUrl, caption);
      posts.push({ tipo, ok: true, mediaId });
    } catch (error) {
      posts.push({ tipo, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (posts.every((post) => !post.ok)) {
    return apiError("No se pudo publicar ningún post de Instagram", new Error(posts.map((p) => p.error).join(" | ")));
  }

  return apiJson({ ok: posts.every((post) => post.ok), posts }, { cachear: false });
}
