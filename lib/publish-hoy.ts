import { buildCaption } from "@/lib/caption";
import { guardarEnlace } from "@/lib/enlaces";
import { registrarSnapshot } from "@/lib/historico";
import { permalinkDeMedia, publishCarouselPost, publishStory } from "@/lib/instagram";
import { getRates } from "@/lib/rates";
import { guardarSnapshotHoy } from "@/lib/snapshot-hoy";

export interface ResultadoPublicacionHoy {
  mediaId: string;
  enlace: string | null;
}

/**
 * Publica el carrusel diario de tasas (bolívares + pesos), una Historia por
 * cada diapositiva, y deja `/hoy` apuntando al carrusel. Puerta única
 * compartida por el cron (`app/api/cron/publish-instagram/route.ts`, dos
 * veces al día con `momento` explícito) y el botón "Publicar ahora" de
 * `/admin/hoy` (sin `momento`, a la hora que el admin decida) — mismo
 * criterio que `ejecutarPublicacion()` para noticias y programadas: si el
 * disparo manual hiciera su propia llamada a Meta, podría divergir de lo que
 * hace el cron.
 *
 * Las Historias no llevan sticker de enlace, así que a diferencia de la del
 * reporte semanal (que sí lo necesita y por eso se descarga y sube a mano)
 * pueden publicarse solas por la Graph API. Cada imagen del carrusel ya
 * incluye su propio título ("Tasas de hoy…") en `?proporcion=9:16`, así que
 * no hace falta redactar nada nuevo para ellas.
 *
 * Solo acompañan al disparo de la mañana (`momento === "manana"`). Una
 * Historia dura 24 h, así que las dos de la tarde se solapaban con las de la
 * mañana del día siguiente: cuatro Historias casi idénticas seguidas en la
 * misma barra, que es el mismo motivo por el que el post diario es un
 * carrusel y no dos publicaciones. La de la mañana es la que abre el día, así
 * que es la que se queda. El disparo manual de `/admin/hoy` tampoco publica
 * Historias: no es ninguna de las dos horas fijas, y sale precisamente cuando
 * ya hubo un post antes que corregir.
 *
 * Sin `momento` no se archiva en `historico_tasas` (`registrarSnapshot` solo
 * corre si se pasa) y el caption sale con "Actualización del día" en vez de
 * "de la mañana/tarde" — no hay bajo qué mitad del día archivar un disparo
 * que no es ninguna de las dos horas fijas, así que se salta en vez de
 * adivinar, igual que ya hacía el cron ante una prueba manual sin el
 * parámetro.
 */
export async function publicarTasasDelDia(
  siteUrl: string,
  momento?: "manana" | "tarde",
): Promise<ResultadoPublicacionHoy> {
  const snapshot = await getRates();

  if (momento) {
    try {
      await registrarSnapshot(snapshot, momento);
    } catch {
      // Sin histórico de este disparo, el reporte semanal y /historial degradan solos.
    }
  }

  // Congela este snapshot como "lo último publicado", para que las rutas de
  // imagen y `/hoy` sirvan siempre esta misma fotografía. Ver el comentario
  // equivalente que tenía el cron: mismo motivo, error tragado a propósito.
  try {
    await guardarSnapshotHoy(snapshot);
  } catch {
    // Sin snapshot congelado, las imágenes del post caen a las tasas en vivo.
  }

  const caption = buildCaption(snapshot, momento);

  // El orden es el orden en que se deslizan: bolívares primero.
  const { mediaId } = await publishCarouselPost(
    [`${siteUrl}/api/og/instagram-post`, `${siteUrl}/api/og/instagram-post-pesos`],
    caption,
  );

  // Una Historia por diapositiva del carrusel, con el mismo orden, y solo en
  // el disparo de la mañana (ver el comentario de arriba). Son un extra sobre
  // el post ya publicado — que es lo irreversible — así que cada una va en su
  // propio `try/catch`: si una falla no debe tocar `mediaId` ni `enlace`, y
  // que falle una no debe impedir la otra.
  if (momento === "manana") {
    try {
      await publishStory(`${siteUrl}/api/og/instagram-post?proporcion=9:16`);
    } catch {
      // Sin Historia en bolívares, el carrusel de feed ya publicado sigue en pie.
    }
    try {
      await publishStory(`${siteUrl}/api/og/instagram-post-pesos?proporcion=9:16`);
    } catch {
      // Sin Historia en pesos, el carrusel de feed ya publicado sigue en pie.
    }
  }

  // El post ya está en la cuenta y eso es lo irreversible: un fallo al anotar
  // el enlace no puede convertir una publicación exitosa en un error que
  // invite a reintentar y duplique el post.
  let enlace: string | null = null;
  try {
    enlace = await permalinkDeMedia(mediaId);
    await guardarEnlace("hoy", enlace);
  } catch {
    enlace = null;
  }

  return { mediaId, enlace };
}
