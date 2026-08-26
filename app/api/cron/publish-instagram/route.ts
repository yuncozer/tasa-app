import type { NextRequest } from "next/server";
import { apiError, apiJson } from "@/lib/api";
import { publicarTasasDelDia } from "@/lib/publish-hoy";
import { getRates } from "@/lib/rates";
import { fechaDeHoy, registrarPendiente, tasasBaseCompletas } from "@/lib/tasas-pendientes";

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
 * La publicación en sí vive en `publicarTasasDelDia()` (`lib/publish-hoy.ts`),
 * compartida con el botón "Publicar ahora" de `/admin/hoy` — ahí no hay
 * `momento` porque el admin puede disparar a cualquier hora, y esta ruta es la
 * única que sí lo pasa explícito.
 *
 * **No publica con un hueco en las tasas base** (dólar BCV, euro BCV, Binance
 * compra/venta): si alguna todavía no respondió a la hora exacta del disparo,
 * esta ruta no llama a `publicarTasasDelDia()` — deja una fila en
 * `tasas_pendientes` (`lib/tasas-pendientes.ts`) y es
 * `app/api/cron/publicar-tasas-pendientes` quien reintenta cada 2 minutos
 * hasta que las cuatro estén completas. Ese gate solo aplica aquí, con
 * `momento` explícito: el botón manual de `/admin/hoy` publica con lo que
 * haya, porque ahí decide una persona mirando la pantalla.
 *
 * A diferencia del resto de las rutas de la API, esta sí exige autenticación:
 * publica en una cuenta real y no debe poder dispararla cualquiera que
 * adivine la ruta.
 */
export const runtime = "nodejs";

/**
 * Publicar un carrusel son cuatro viajes a Meta —dos contenedores hijos, el
 * padre y la publicación—, y crear cada hijo obliga a Meta a descargarse una
 * imagen que se renderiza al vuelo. Las dos Historias que salen después
 * (`publishStory()` en `lib/publish-hoy.ts`) suman dos viajes más cada una
 * —crear contenedor y publicar—, sin el sondeo largo que sí necesita un
 * video: una Historia de imagen resuelve con el reintento corto de
 * `publicarContenedor()`. Con el tope por defecto de la plataforma eso va
 * justo, y encima `publicarContenedor()` puede esperar hasta 8 s reintentando
 * si Meta todavía está procesando.
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
    const momento = momentoDesdeQuery(request);

    if (momento) {
      const snapshot = await getRates();
      if (!tasasBaseCompletas(snapshot)) {
        await registrarPendiente(fechaDeHoy(), momento);
        return apiJson({ ok: true, estado: "pendiente" }, { cachear: false });
      }
    }

    const { mediaId, enlace } = await publicarTasasDelDia(siteUrl, momento);
    return apiJson({ ok: true, mediaId, enlace }, { cachear: false });
  } catch (error) {
    return apiError("No se pudo publicar el post de Instagram", error);
  }
}
