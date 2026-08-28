import { apiError, apiJson } from "@/lib/api";
import { buildParadaCaption } from "@/lib/caption";

import { notificarParadaPendiente } from "@/lib/notificar";
import { diaDeLaColumna, guardarParadaPendiente, leerParadaPendiente } from "@/lib/parada";
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

    // **Solo la columna de hoy.** El listado devuelve el artículo más
    // reciente que case con el título, y algunos días no hay columna nueva:
    // entonces el más reciente es el de ayer y guardarlo dejaba
    // `/admin/parada` ofreciendo publicar como "el dólar de hoy" unas cifras
    // que ya no lo eran. Pasó en producción el 28 de agosto con el artículo
    // del 27, y comparar la URL con la guardada no lo evita: el portal
    // republicó esa misma columna bajo un slug nuevo (`…-27a-2`), que para el
    // cron era un artículo distinto.
    //
    // De qué día es lo decide `diaDeLaColumna()`, que se apoya en el titular
    // porque lanacionweb no fecha sus artículos (ver ahí).
    const { esDeHoy } = diaDeLaColumna(article.publishedAt, article.title || encontrado.titulo);

    // `null` es "no se pudo saber": ahí se deja pasar, porque un borrador que
    // el admin revisa es mejor que ningún borrador, y la pantalla avisa de
    // que no se pudo fechar. `false` sí bloquea: es la columna de otro día.
    if (esDeHoy === false) {
      return apiJson(
        { ok: true, detectado: false, motivo: "no_es_de_hoy", titulo: article.title },
        { cachear: false },
      );
    }

    const caption = buildParadaCaption(article);

    await guardarParadaPendiente({
      url: encontrado.url,
      titulo: article.title,
      imagenUrl: article.imageUrl,
      caption,
      fechaArticulo: article.publishedAt,
    });

    // El borrador ya quedó guardado y `/admin/parada` lo muestra igual sin
    // el correo: un fallo al avisar no puede tumbar la detección, mismo
    // criterio que `calentarVideo` y el resto de notificaciones "de más".
    // `notificar()` nunca lanza, así que aquí ya no hace falta envolverlo.
    await notificarParadaPendiente(article.title);

    return apiJson({ ok: true, detectado: true, url: encontrado.url }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo vigilar el artículo de La Parada", error);
  }
}
