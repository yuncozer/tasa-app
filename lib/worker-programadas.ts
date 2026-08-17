import {
  crearContenedorImagen,
  crearContenedorReel,
  crearHijosCarrusel,
  crearPadreCarrusel,
  estadoContenedor,
  publicarContenedor,
} from "@/lib/instagram";
import type { ContenedoresProgramada, FaseProgramada, Programada } from "@/lib/programadas";
import { cerrarProgramada, guardarAvance, liberarProgramada } from "@/lib/programadas";
import { anotarEnlacePost, leerPublicacionPayload, prepararPublicacion } from "@/lib/publish-news";

/**
 * Avanza una publicación de la cola por fases, dejando anotado en la fila por
 * dónde va.
 *
 * Existe porque publicar un carrusel con video no cabe en una sola petición:
 * Meta procesa cada contenedor de forma asíncrona y hay que sondearlo, lo que
 * puede llevar minutos, mientras que una función de Vercel muere al minuto y
 * cron-job.org da por fallida cualquier respuesta que pase de 30 segundos.
 * Antes de esto, la ejecución moría a mitad y la fila se quedaba en
 * `publicando` sin publicarse y sin poder reintentarse.
 *
 * La comparten los dos disparadores —el cron y el botón "Publicar ahora"— por
 * la misma razón que `ejecutarPublicacion()`: si divergieran, lo que sale a la
 * hora programada dejaría de ser lo que se probó a mano.
 */

/** Cuánto trabaja como mucho una llamada, para responder antes de los 30 s de cron-job.org. */
const PRESUPUESTO_MS = 20_000;

/** Espera entre sondeos dentro de una misma llamada. */
const SONDEO_MS = 3_000;

export interface ResultadoAvance {
  /** En qué quedó la fila tras gastar el presupuesto. */
  estado: "publicada" | "fallida" | "en_proceso";
  fase?: FaseProgramada;
  /** La fase en lenguaje llano, que es lo que se le enseña al admin. */
  texto?: string;
  mediaId?: string;
  error?: string;
}

/** Texto para el admin: qué está pasando ahora mismo con esta publicación. */
export const TEXTO_FASE: Record<FaseProgramada, string> = {
  creando: "Preparando el contenido…",
  esperando_hijos: "Instagram está procesando el video…",
  esperando_padre: "Instagram está armando el post…",
  publicando_meta: "Publicando…",
};

export async function avanzarPublicacion(programada: Programada): Promise<ResultadoAvance> {
  const hasta = Date.now() + PRESUPUESTO_MS;

  // Se valida aunque venga de nuestra propia tabla: pudo guardarse con una
  // versión anterior del código.
  const payload = leerPublicacionPayload(programada.payload);
  if (!payload) {
    const error = "El contenido guardado ya no es válido";
    await cerrarProgramada(programada.id, { error });
    return { estado: "fallida", error };
  }

  let fase: FaseProgramada = programada.fase ?? "creando";
  let contenedores: ContenedoresProgramada = programada.contenedores ?? {};

  try {
    while (Date.now() < hasta) {
      if (fase === "creando") {
        const preparada = await prepararPublicacion(payload);

        if (preparada.tipo === "carrusel") {
          const hijos = await crearHijosCarrusel(preparada.elementos);
          contenedores = { hijos, tipos: preparada.elementos.map((e) => e.tipo) };
          fase = "esperando_hijos";
        } else {
          // Una imagen suelta o un Reel no tienen hijos: su contenedor único ya
          // es el que se publica, así que entran directos a la espera del padre.
          contenedores = {
            padre:
              preparada.tipo === "reel"
                ? await crearContenedorReel(preparada.videoUrl, preparada.caption)
                : await crearContenedorImagen(preparada.imageUrl, preparada.caption),
          };
          fase = "esperando_padre";
        }

        await guardarAvance(programada.id, { fase, contenedores });
        continue;
      }

      if (fase === "esperando_hijos") {
        // Solo los videos tardan; una imagen está lista en cuanto se crea.
        const videos = (contenedores.hijos ?? []).filter(
          (_, i) => contenedores.tipos?.[i] === "video",
        );
        const estados = await Promise.all(
          videos.map((id) => estadoContenedor(id, "un video del carrusel")),
        );

        if (estados.some((estado) => estado === "procesando")) {
          await esperar(SONDEO_MS, hasta);
          continue;
        }

        fase = "esperando_padre";
        await guardarAvance(programada.id, { fase, contenedores });
        continue;
      }

      if (fase === "esperando_padre") {
        if (!contenedores.padre) {
          // El padre solo se puede armar cuando Meta terminó con los hijos; si
          // no, lo rechaza. El caption sale del payload y no de
          // `prepararPublicacion()`, que volvería a scrapear y a firmar todas
          // las imágenes para acabar usando una sola cadena de texto.
          if (payload.tipo !== "carrusel") throw new Error("Falta el contenedor por publicar");
          contenedores = {
            ...contenedores,
            padre: await crearPadreCarrusel(contenedores.hijos ?? [], payload.caption),
          };
          await guardarAvance(programada.id, { fase, contenedores });
        }

        const padre = contenedores.padre;
        if (!padre) throw new Error("Falta el contenedor por publicar");

        if ((await estadoContenedor(padre, "el post")) === "procesando") {
          await esperar(SONDEO_MS, hasta);
          continue;
        }

        fase = "publicando_meta";
        await guardarAvance(programada.id, { fase, contenedores });
        continue;
      }

      // `publicando_meta`: el único paso irreversible. A partir de aquí nadie
      // retoma esta fila automáticamente.
      if (!contenedores.padre) throw new Error("Falta el contenedor por publicar");
      const mediaId = await publicarContenedor(contenedores.padre);
      await cerrarProgramada(programada.id, { mediaId });

      // El slug ya viaja en el propio caption desde que se programó
      // (`materializarParaProgramar` → `conEnlacePost`); aquí solo se anota a
      // dónde quedó, igual que hace `ejecutarPublicacion` para el botón
      // inmediato.
      const slugEnlace =
        payload.tipo === "manual" || payload.tipo === "carrusel" || payload.tipo === "reel"
          ? payload.slugEnlace
          : undefined;
      if (slugEnlace) await anotarEnlacePost(slugEnlace, mediaId);

      return { estado: "publicada", mediaId };
    }
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    await cerrarProgramada(programada.id, { error: detalle });
    return { estado: "fallida", error: detalle };
  }

  // Se acabó el turno con la fila a medias: queda anotada y suelta, para que la
  // retome enseguida el disparo siguiente (o el navegador, si alguien está
  // mirando desde "Publicar ahora").
  await liberarProgramada(programada.id);
  return { estado: "en_proceso", fase, texto: TEXTO_FASE[fase] };
}

/** Espera, pero nunca más allá del presupuesto de esta llamada. */
function esperar(ms: number, hasta: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(ms, hasta - Date.now()))));
}
