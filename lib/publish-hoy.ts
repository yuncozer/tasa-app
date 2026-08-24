import { buildCaption } from "@/lib/caption";
import { guardarEnlace } from "@/lib/enlaces";
import { registrarSnapshot } from "@/lib/historico";
import { permalinkDeMedia, publishCarouselPost } from "@/lib/instagram";
import { getRates } from "@/lib/rates";
import { guardarSnapshotHoy } from "@/lib/snapshot-hoy";

export interface ResultadoPublicacionHoy {
  mediaId: string;
  enlace: string | null;
}

/**
 * Publica el carrusel diario de tasas (bolívares + pesos) y deja `/hoy`
 * apuntando a él. Puerta única compartida por el cron
 * (`app/api/cron/publish-instagram/route.ts`, dos veces al día con
 * `momento` explícito) y el botón "Publicar ahora" de `/admin/hoy` (sin
 * `momento`, a la hora que el admin decida) — mismo criterio que
 * `ejecutarPublicacion()` para noticias y programadas: si el disparo manual
 * hiciera su propia llamada a Meta, podría divergir de lo que hace el cron.
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
