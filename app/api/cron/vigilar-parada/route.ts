import { apiError, apiJson } from "@/lib/api";
import { buildParadaCaption } from "@/lib/caption";
import { notificarParadaPendiente } from "@/lib/notificar-parada";
import { guardarParadaPendiente, leerParadaPendiente } from "@/lib/parada";
import { fetchArticle } from "@/lib/providers/news";
import { buscarArticuloParada } from "@/lib/providers/parada";

/**
 * Vigila la categoría "Frontera" de lanacionweb.com en busca del artículo
 * diario "Dólar en La Parada" y, si es uno nuevo, prepara el borrador que
 * `/admin/parada` ofrece publicar con un toque.
 *
 * No publica solo. lanacionweb lo saca a una hora distinta cada día —a
 * veces no lo saca— y el cuerpo se extrae con una expresión regular sobre
 * prosa libre; un cambio de redacción puede colar un número equivocado bajo
 * la marca de La Tasa. Por eso este cron solo detecta y arma el caption, y
 * un humano decide si publicarlo — mismo criterio que ya rige el resto de
 * `/admin/noticia`: "revisión humana", nunca IA ni scraping publicando solos.
 *
 * Se dispara con la misma frecuencia con la que se revisa la cola de
 * programadas (cron-job.org, cada pocos minutos): la columna no tiene hora
 * fija, así que hay que consultar seguido para no dejarla horas sin detectar.
 *
 * Protegida con `CRON_SECRET`, como el resto de crons.
 */
export const runtime = "nodejs";

/**
 * Sin esto, Vercel corta la función a los 10 s por defecto — antes de que
 * termine ni el fetch del listado. El disparo real (listado + artículo +
 * lectura/escritura en Supabase) rara vez tarda tanto, pero cron-job.org ya
 * da por fallida cualquier respuesta que pase de 30 s en su plan gratuito;
 * dejar el mismo margen que las demás rutas que hablan con servicios
 * externos (60 s) evita que Vercel sea el primero en cortar.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("No autorizado", undefined, 401);
  }

  try {
    const encontrado = await buscarArticuloParada();
    if (!encontrado) {
      return apiJson({ ok: true, detectado: false }, { cachear: false });
    }

    const pendiente = await leerParadaPendiente().catch(() => null);
    if (pendiente?.url === encontrado.url) {
      return apiJson({ ok: true, detectado: false, url: encontrado.url }, { cachear: false });
    }

    const article = await fetchArticle(encontrado.url);
    const caption = buildParadaCaption(article);

    await guardarParadaPendiente({
      url: encontrado.url,
      titulo: article.title,
      imagenUrl: article.imageUrl,
      caption,
    });

    // El borrador ya quedó guardado y `/admin/parada` lo muestra igual sin
    // el correo: un fallo al avisar no puede tumbar la detección, mismo
    // criterio que `calentarVideo` y el resto de notificaciones "de más".
    try {
      await notificarParadaPendiente(article.title);
    } catch {
      // El admin igual puede enterarse abriendo /admin/parada a mano.
    }

    return apiJson({ ok: true, detectado: true, url: encontrado.url }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo vigilar el artículo de La Parada", error);
  }
}
