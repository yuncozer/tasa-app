import { buildCaption } from "@/lib/caption";
import { guardarEnlace } from "@/lib/enlaces";
import { registrarSnapshot } from "@/lib/historico";
import { permalinkDeMedia, publishCarouselPost, publishStory } from "@/lib/instagram";
import { getRates } from "@/lib/rates";
import { guardarSnapshotHoy } from "@/lib/snapshot-hoy";

export interface ResultadoPublicacionHoy {
  /** `null` en modo `solo_historias`: ahí no hay post de feed que enlazar. */
  mediaId: string | null;
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
 * Solo se publican en el disparo de la mañana (`momento === "manana"`) o en
 * el botón manual de `/admin/hoy` (sin `momento`). El de la tarde
 * (`momento === "tarde"`) se queda solo con el carrusel: dos Historias
 * idénticas en formato el mismo día saturan quien mira el timeline, y la de
 * la mañana ya cumplió el propósito de avisar que hay tasas nuevas. La
 * excepción es el modo `solo_historias`, donde son lo único que se publica y
 * por tanto salen a cualquier hora.
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
  /**
   * Qué se publica en este disparo (ver `lib/ajustes-publicacion.ts`). Solo
   * lo pasa el cron, leyendo lo que el admin dejó configurado para hoy; el
   * botón manual de `/admin/hoy` publica siempre completo, porque ahí hay una
   * persona decidiendo en ese momento.
   *
   * `apagado` no llega hasta aquí: eso lo resuelve la ruta del cron sin
   * llamar a esta función, que es lo que evita congelar un snapshot y
   * archivar un histórico de algo que no se publicó.
   */
  modo: "completo" | "solo_historias" = "completo",
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

  // En `solo_historias` no hay carrusel, y por tanto tampoco `mediaId` ni
  // permalink que anotar: `/hoy` sigue apuntando al último post de feed que
  // sí salió, que es lo correcto — ese atajo promete llevar a un post, y una
  // Historia dura 24 horas y no tiene enlace estable.
  const mediaId =
    modo === "completo"
      ? // El orden es el orden en que se deslizan: bolívares primero.
        (
          await publishCarouselPost(
            [`${siteUrl}/api/og/instagram-post`, `${siteUrl}/api/og/instagram-post-pesos`],
            caption,
          )
        ).mediaId
      : null;

  // Una Historia por diapositiva del carrusel, con el mismo orden. Son un
  // extra sobre el post ya publicado — que es lo irreversible — así que cada
  // una va en su propio `try/catch`: si una falla no debe tocar `mediaId` ni
  // `enlace`, y que falle una no debe impedir la otra. Se saltan en el
  // disparo de la tarde: ver el comentario de la función.
  // Con el carrusel completo salen solo en la mañana (ver arriba). En
  // `solo_historias` salen siempre: son lo único que se publica, así que
  // saltárselas por la hora dejaría el disparo sin nada.
  if (modo === "solo_historias" || momento !== "tarde") {
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
  if (mediaId) {
    try {
      enlace = await permalinkDeMedia(mediaId);
      await guardarEnlace("hoy", enlace);
    } catch {
      enlace = null;
    }
  }

  return { mediaId, enlace };
}
