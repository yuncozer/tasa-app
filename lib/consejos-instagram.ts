/**
 * Qué hacer con lo que dicen las métricas.
 *
 * Un panel que solo enseña cifras deja el trabajo a medias: "alcance 4.120" no
 * dice si eso está bien ni qué conviene cambiar. Estas reglas convierten los
 * datos que ya se leen en frases accionables, sin pedir nada más a la Graph
 * API y **sin IA**: son criterios explícitos que se pueden discutir y
 * corregir, no una opinión generada que nadie puede auditar. Es la misma
 * razón por la que la IA del proyecto solo redacta prosa y nunca toca cifras.
 *
 * Tres reglas de la casa:
 *
 * - **Ninguna sugerencia sin muestra suficiente.** Cada regla declara su
 *   mínimo y se calla si no llega. Un consejo sacado de dos posts es una
 *   corazonada con cara de dato.
 * - **Cada consejo dice de dónde sale.** El `porque` lleva la cifra que lo
 *   sostiene, para que se pueda contrastar en la misma pantalla en vez de
 *   creerlo a ciegas.
 * - **Nunca se inventa una causa.** Se describe lo que se midió y se propone
 *   una acción; por qué cayó el alcance esta semana no lo sabe nadie desde
 *   aquí.
 */

import { formatEntero, formatPercent } from "@/lib/format";
import type { CrecimientoSeguidores } from "@/lib/historico-instagram";
import type { ActividadInstagram, AnaliticasInstagram } from "@/lib/instagram-insights";
import { variacionPorcentual } from "@/lib/instagram-insights";

export interface Consejo {
  /** La acción, en imperativo y en una línea. */
  titulo: string;
  /** La cifra que la sostiene. */
  porque: string;
  /** `atencion` para lo que va peor; `bien` para confirmar algo que funciona. */
  tono: "atencion" | "bien" | "neutro";
}

/** Cuánto tiene que moverse algo para que valga la pena mencionarlo. */
const UMBRAL_CAMBIO = 15;

/** Por debajo de esto, cualquier conclusión sobre los posts es ruido. */
const MINIMO_POSTS = 4;

export function construirConsejos({
  analiticas,
  actividad,
  crecimiento,
  dias,
}: {
  analiticas: AnaliticasInstagram;
  actividad: ActividadInstagram;
  crecimiento: CrecimientoSeguidores;
  dias: number;
}): Consejo[] {
  const consejos: Consejo[] = [];

  // 1. Alcance contra el período anterior. Es la cifra que resume si lo que se
  //    publica está llegando a más gente o a menos.
  const alcance = variacionPorcentual(
    analiticas.totales.reach,
    analiticas.totalesAnteriores.reach,
  );
  if (alcance !== null && Math.abs(alcance) >= UMBRAL_CAMBIO) {
    consejos.push(
      alcance > 0
        ? {
            titulo: "Sigue con lo que estás publicando",
            porque: `El alcance subió ${formatPercent(alcance)} frente a los ${dias} días anteriores.`,
            tono: "bien",
          }
        : {
            titulo: "Revisa qué cambió: el alcance viene cayendo",
            porque: `Bajó ${formatPercent(Math.abs(alcance))} frente a los ${dias} días anteriores.`,
            tono: "atencion",
          },
    );
  }

  // 2. Franja horaria. La sugerencia más accionable que hay: cambiar la hora
  //    de un cron no cuesta nada y el efecto se mide solo.
  const franjas = actividad.franjas;
  if (franjas?.mejor) {
    consejos.push({
      titulo:
        franjas.mejor === "tarde"
          ? "Mueve el post importante a la tarde"
          : "Mueve el post importante a la mañana",
      porque: `Los de la ${franjas.mejor === "tarde" ? "tarde" : "mañana"} tienen ${formatPercent(franjas.diferencia)} más interacciones (mediana de ${franjas.postsManana} y ${franjas.postsTarde} posts).`,
      tono: "neutro",
    });
  }

  // 3. Un post que se despegó del resto. Sirve para repetir el formato, que es
  //    lo único que se puede repetir a voluntad.
  const mejor = actividad.mejorPost;
  const medianaPeriodo = actividad.medianaPeriodo;
  if (
    mejor &&
    medianaPeriodo !== null &&
    medianaPeriodo > 0 &&
    actividad.postsEnPeriodo >= MINIMO_POSTS &&
    mejor.interacciones >= medianaPeriodo * 2
  ) {
    consejos.push({
      titulo: "Repite el formato de tu mejor post",
      porque: `«${primeraLinea(mejor.caption)}» juntó ${formatEntero(mejor.interacciones)} interacciones, más del doble de la mediana del período.`,
      tono: "bien",
    });
  }

  // 4. Seguidores, con nuestro propio histórico: la API no guarda el pasado.
  const seguidores = analiticas.perfil.seguidores;
  const variacionSeguidores = variacionPorcentual(seguidores, crecimiento.anterior);
  if (
    typeof seguidores === "number" &&
    typeof crecimiento.anterior === "number" &&
    variacionSeguidores !== null
  ) {
    const ganados = seguidores - crecimiento.anterior;
    if (ganados <= 0) {
      consejos.push({
        titulo: "La cuenta no está sumando seguidores",
        porque:
          ganados === 0
            ? `Los mismos ${formatEntero(seguidores)} que hace ${dias} días.`
            : `${formatEntero(Math.abs(ganados))} menos que hace ${dias} días.`,
        tono: "atencion",
      });
    } else {
      consejos.push({
        titulo: "La cuenta viene creciendo",
        porque: `${formatEntero(ganados)} seguidores más que hace ${dias} días (${formatPercent(variacionSeguidores)}).`,
        tono: "bien",
      });
    }
  }

  // 5. Interacciones por alcance: cuánta de la gente que ve el post hace algo.
  //    Solo se menciona cuando el alcance da una base decente.
  const reach = analiticas.totales.reach;
  const interacciones = analiticas.totales.total_interactions;
  if (typeof reach === "number" && reach >= 200 && typeof interacciones === "number") {
    const tasa = (interacciones / reach) * 100;
    if (tasa < 2) {
      consejos.push({
        titulo: "Pide algo en el caption: casi nadie interactúa",
        porque: `${formatPercent(tasa)} de quienes ven el post reaccionan, comentan o lo guardan.`,
        tono: "atencion",
      });
    }
  }

  return consejos;
}

/** El caption entero no cabe en una frase; la primera línea ya identifica el post. */
function primeraLinea(caption: string | null): string {
  if (!caption) return "Sin texto";
  const linea = caption.split("\n").find((l) => l.trim() !== "") ?? "Sin texto";
  return linea.length > 48 ? `${linea.slice(0, 48)}…` : linea;
}
