import { piezasDe, type ModoPublicacion } from "@/lib/ajustes-publicacion";
import { buildCaption } from "@/lib/caption";
import { guardarEnlace } from "@/lib/enlaces";
import { registrarSnapshot } from "@/lib/historico";
import { permalinkDeMedia, publishCarouselPost, publishStory } from "@/lib/instagram";
import { avisarTasasDelDia, avisoDeTasas } from "@/lib/push";
import { getRates } from "@/lib/rates";
import { guardarSnapshotHoy } from "@/lib/snapshot-hoy";

/**
 * No se pudo congelar el snapshot en `snapshot_hoy`, así que no se publicó
 * nada. Es un tipo aparte porque quien llama tiene que distinguirlo de un
 * fallo al publicar: aquí no llegó a tocarse Meta, no hay nada a medias en la
 * cuenta y el disparo se puede reintentar entero sin riesgo de duplicar el
 * post. La ruta del cron lo trata como una espera más (`tasas_pendientes`),
 * no como un error de la petición.
 */
export class SnapshotNoCongelado extends Error {
  constructor(readonly causa: unknown) {
    super("No se pudo congelar el snapshot del día, así que no se publicó");
    this.name = "SnapshotNoCongelado";
  }
}

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
  modo: Exclude<ModoPublicacion, "apagado"> = "completo",
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
  // imagen y `/hoy` sirvan siempre esta misma fotografía.
  //
  // Y si no se puede congelar, **no se publica**. Este error se tragaba, con
  // el argumento de que las imágenes caerían a las tasas en vivo; pero eso no
  // es lo que pasa cuando ya hay una fila de un disparo anterior, que es el
  // caso normal a partir de la segunda publicación del día: `snapshotDelDia()`
  // encuentra la de la mañana y la sirve tan campante. El 8 de septiembre de
  // 2026 este `POST` dio un 504 y el post de la tarde salió con la imagen
  // diciendo "09:00 AM" y 967,46 Bs mientras el caption decía 970,00 — el
  // mismo post afirmando dos cifras para la misma tasa, que es exactamente el
  // fallo que `lib/snapshot-hoy.ts` existe para evitar.
  //
  // Se lanza **antes** de hablar con Meta, así que aquí todavía no hay nada
  // irreversible: no publicar es gratis y se reintenta en dos minutos. Es el
  // mismo criterio que ya gatea las tasas incompletas y el salto anómalo —
  // una imagen vieja servida como fresca es el único daño real que esta app
  // puede causar— y por eso, a diferencia de aquellas dos puertas, esta
  // aplica **también al botón manual** de `/admin/hoy`: la excepción de "ahí
  // hay una persona decidiendo" vale para publicar con una tasa que falta, no
  // para publicar una imagen que contradice su propio caption, que no es algo
  // que nadie esté eligiendo.
  try {
    await guardarSnapshotHoy(snapshot);
  } catch (error) {
    throw new SnapshotNoCongelado(error);
  }

  const caption = buildCaption(snapshot, momento);

  // En `solo_historias` no hay carrusel, y por tanto tampoco `mediaId` ni
  // permalink que anotar: `/hoy` sigue apuntando al último post de feed que
  // sí salió, que es lo correcto — ese atajo promete llevar a un post, y una
  // Historia dura 24 horas y no tiene enlace estable.
  const { carrusel, historias } = piezasDe(modo);

  // El orden es el orden en que se deslizan: bolívares primero.
  const mediaId = carrusel
    ? (
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
  // Que salgan o no lo decide **el modo**, no la hora. Antes esto era
  // `momento !== "tarde"`, con la regla "las Historias solo acompañan al post
  // de la mañana" escrita aquí dentro; ahora esa regla vive en
  // `modoPorDefecto()` como lo que es —una rutina de la cuenta, no una ley
  // del código— y aquí solo se obedece lo que se pidió para este disparo.
  if (historias) {
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

  // El aviso push, con las mismas cifras que acaban de publicarse.
  //
  // Va **solo con `momento` explícito**, o sea solo desde los dos crons y no
  // desde el botón manual de `/admin/hoy` — mismo criterio que
  // `registrarSnapshot()` unas líneas arriba. Ahí hay una persona que puede
  // estar probando, y una prueba no puede sonar en el teléfono de todo el
  // mundo.
  //
  // Y va en su propio `try/catch` tragado, como anotar el enlace y las
  // Historias: el post ya está en la cuenta, y un aviso que no sale no puede
  // convertir una publicación correcta en un error que invite a reintentar.
  if (momento) {
    try {
      await avisarTasasDelDia(avisoDeTasas(snapshot, momento));
    } catch {
      // Sin aviso, el post ya publicado sigue en pie.
    }
  }

  return { mediaId, enlace };
}
