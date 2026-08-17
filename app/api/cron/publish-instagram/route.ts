import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { buildCaption } from "@/lib/caption";
import { guardarEnlace } from "@/lib/enlaces";
import { registrarSnapshot } from "@/lib/historico";
import { permalinkDeMedia, publishCarouselPost } from "@/lib/instagram";
import { getRates } from "@/lib/rates";

/**
 * Se dispara dos veces al día, hora de Caracas: 9:00 am y 6:00 pm. Cada
 * disparo llama a esta misma ruta con `?momento=manana` o `?momento=tarde`,
 * que es lo que decide el título del caption — explícito en vez de inferirlo
 * de la hora del reloj, así no se rompe si algún día se cambian los horarios.
 *
 * Quien dispara es **cron-job.org**, no Vercel Cron: en el plan Hobby los
 * crons se ejecutan "dentro de la hora" y no a la hora exacta, así que el post
 * de las 9:00 podía salir a las 9:50. Ver la sección de publicaciones
 * programadas en `CLAUDE.md`.
 *
 * Cada disparo publica **un carrusel de dos diapositivas**: las tasas en
 * bolívares y las mismas tasas en pesos. Son un solo post y no dos porque
 * cuatro publicaciones casi idénticas al día saturan el feed y el perfil, y
 * porque el post en pesos es el complemento del de bolívares, no una noticia
 * aparte. De paso desaparece el estado a medias: un carrusel sale entero o no
 * sale, mientras que dos publicaciones seguidas pueden dejar la primera
 * publicada y la segunda no.
 *
 * A diferencia del resto de las rutas de la API, esta sí exige autenticación:
 * publica en una cuenta real y no debe poder dispararla cualquiera que
 * adivine la ruta.
 */
export const runtime = "nodejs";

/**
 * Publicar un carrusel son cuatro viajes a Meta —dos contenedores hijos, el
 * padre y la publicación—, y crear cada hijo obliga a Meta a descargarse una
 * imagen que se renderiza al vuelo. Con el tope por defecto de la plataforma
 * eso va justo, y encima `publicarContenedor()` puede esperar hasta 8 s
 * reintentando si Meta todavía está procesando.
 */
export const maxDuration = 60;

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

    // Archiva el snapshot del día para que el reporte semanal pueda calcular
    // variaciones. Va en su propio `try` con el error tragado, igual que
    // `guardarEnlace` más abajo y por el mismo motivo: si fuera dentro del
    // `try` grande, un Supabase caído convertiría una publicación correcta en
    // un 500 que invita a reintentar y duplica el post. Lo peor que pasa al
    // fallar es un hueco de un día, que la ventana de tolerancia de
    // `leerComparativa` ya absorbe.
    //
    // Se archiva aquí, y no en `getRates()` ni en `/api/rates`, porque este
    // cron ya corre dos veces al día a hora fija y ya tiene el snapshot en la
    // mano: en las otras dos sería una escritura por visitante. Y así lo que
    // queda guardado es exactamente lo que se publicó.
    try {
      await registrarSnapshot(snapshot);
    } catch {
      // Sin histórico de hoy, el reporte semanal degrada solo.
    }

    const caption = buildCaption(snapshot, momentoDesdeQuery(request));

    // El orden es el orden en que se deslizan: bolívares primero.
    const { mediaId } = await publishCarouselPost(
      [`${siteUrl}/api/og/instagram-post`, `${siteUrl}/api/og/instagram-post-pesos`],
      caption,
    );

    // Deja `/hoy` apuntando al post que acaba de salir. Va aparte del
    // `try` de la publicación y con su error tragado a propósito: el post ya
    // está en la cuenta y eso es lo irreversible, así que un fallo al anotar
    // el enlace no puede convertir una publicación exitosa en una respuesta
    // de error que invite a reintentar y duplique el post. Si falla, `/hoy`
    // cae a su respaldo y lo peor que pasa es que apunte al post anterior.
    let enlace: string | null = null;
    try {
      enlace = await permalinkDeMedia(mediaId);
      await guardarEnlace("hoy", enlace);
    } catch {
      enlace = null;
    }

    return apiJson({ ok: true, mediaId, enlace }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de Instagram", error);
  }
}
