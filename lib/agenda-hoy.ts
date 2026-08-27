/**
 * "Qué falta hoy": el estado operativo del día, para que abrir `/admin` diga
 * qué necesita atención sin entrar sección por sección.
 *
 * No mide nada nuevo. Todo lo que hay aquí ya estaba en la base —
 * `historico_tasas` sabe qué disparo del cron llegó a publicar,
 * `tasas_pendientes` sabe si alguno se quedó esperando, `parada_pendiente`
 * sabe si hay borrador sin revisar y la cola sabe qué está programado— y lo
 * único que faltaba era juntarlo en una lectura y presentarlo como una lista
 * de pendientes.
 *
 * Dos criterios que gobiernan todo el módulo:
 *
 * - **El reloj decide si algo es un problema o todavía no.** A las 8 de la
 *   mañana que el post de las 9:00 no esté publicado es lo normal; a las 11 es
 *   un fallo. Sin esa distinción el panel estaría en ámbar media jornada y el
 *   ámbar dejaría de significar nada — la misma regla que ya rige `--warning`
 *   en la app pública.
 * - **Cada fuente se lee por separado y falla por separado.** Un Supabase
 *   caído deja esa fila en "sin dato", no tumba la agenda entera ni el panel:
 *   mismo criterio que las insignias de las tarjetas.
 */

import { diaCaracasISO, horaCaracas } from "@/lib/format";
import { momentosArchivados } from "@/lib/historico";
import { leerParadaPendiente } from "@/lib/parada";
import { listarProgramadas } from "@/lib/programadas";
import { pendienteActual } from "@/lib/tasas-pendientes";

/** Las horas de Caracas a las que dispara el cron de tasas. */
const HORA_MANANA = 9;
const HORA_TARDE = 18;

/**
 * Cuánto margen se le da al cron antes de dar por fallido un disparo.
 *
 * cron-job.org dispara puntual, pero la publicación puede tardar —Meta
 * procesa los contenedores— y, si faltaba una tasa base, el reintento va
 * cada dos minutos hasta que las fuentes respondan. Una hora es holgado sin
 * llegar a tapar un fallo de verdad.
 */
const MARGEN_HORAS = 1;

export type EstadoTarea = "hecho" | "pendiente" | "esperando" | "problema" | "sin_dato";

export interface TareaHoy {
  id: string;
  titulo: string;
  /** El estado en lenguaje llano: es lo que se lee, no un código. */
  detalle: string;
  estado: EstadoTarea;
  /** A dónde ir a resolverlo, cuando hay dónde. */
  href?: string;
}

function estadoDelPost(
  archivados: Momentos,
  pendiente: { fecha: string; momento: string } | null,
  momento: "manana" | "tarde",
  hora: number,
  hoy: string,
): { detalle: string; estado: EstadoTarea } {
  if (archivados.includes(momento)) return { detalle: "Publicado", estado: "hecho" };

  // La fila tiene que ser de hoy **y** de este momento: una que quedara viva
  // de ayer no dice nada del disparo de esta mañana.
  if (pendiente?.momento === momento && pendiente.fecha === hoy) {
    return {
      // Que esté en la cola no es un fallo: es el sistema esperando a que las
      // tasas estén completas y sean creíbles, y reintentando solo cada dos
      // minutos. El motivo exacto viaja en el correo, no aquí: la fila no lo
      // guarda y adivinarlo sería inventarlo.
      detalle: "En espera · reintentando cada 2 minutos",
      estado: "pendiente",
    };
  }

  const horaObjetivo = momento === "manana" ? HORA_MANANA : HORA_TARDE;
  if (hora < horaObjetivo) {
    return { detalle: `Sale a las ${horaObjetivo}:00`, estado: "esperando" };
  }
  if (hora < horaObjetivo + MARGEN_HORAS) {
    return { detalle: "Publicándose…", estado: "esperando" };
  }

  return { detalle: "No salió. Se puede publicar a mano", estado: "problema" };
}

type Momentos = ("manana" | "tarde")[];

async function tareasDeTasas(hoy: string, hora: number): Promise<TareaHoy[]> {
  let archivados: Momentos = [];
  let pendiente: { fecha: string; momento: string } | null = null;

  try {
    [archivados, pendiente] = await Promise.all([momentosArchivados(hoy), pendienteActual()]);
  } catch {
    return [
      {
        id: "tasas",
        titulo: "Posts de tasas",
        detalle: "No se pudo consultar el estado",
        estado: "sin_dato",
        href: "/admin/hoy",
      },
    ];
  }

  return (["manana", "tarde"] as const).map((momento) => ({
    id: `tasas-${momento}`,
    titulo: momento === "manana" ? "Post de la mañana" : "Post de la tarde",
    ...estadoDelPost(archivados, pendiente, momento, hora, hoy),
    href: "/admin/hoy",
  }));
}

async function tareaDeParada(hoy: string): Promise<TareaHoy> {
  const base = { id: "parada", titulo: "Dólar en La Parada", href: "/admin/parada" };

  try {
    const borrador = await leerParadaPendiente();

    if (!borrador) {
      return { ...base, detalle: "Sin artículo detectado todavía", estado: "esperando" };
    }

    const esDeHoy = diaCaracasISO(new Date(borrador.detectadoEn).getTime()) === hoy;

    if (!borrador.publicado) {
      return {
        ...base,
        // Un borrador sin revisar sí es una tarea, sea de hoy o de ayer: es lo
        // único de este proyecto que espera por una persona para salir.
        detalle: esDeHoy ? "Borrador nuevo por revisar" : "Borrador de otro día sin publicar",
        estado: "pendiente",
      };
    }

    return esDeHoy
      ? { ...base, detalle: "Publicado", estado: "hecho" }
      : { ...base, detalle: "Sin artículo nuevo hoy", estado: "esperando" };
  } catch {
    return { ...base, detalle: "No se pudo consultar el estado", estado: "sin_dato" };
  }
}

async function tareaDeCola(hoy: string): Promise<TareaHoy | null> {
  try {
    const programadas = await listarProgramadas();

    const fallidas = programadas.filter((fila) => fila.estado === "fallida").length;
    if (fallidas > 0) {
      return {
        id: "cola",
        titulo: "Cola de publicaciones",
        detalle: `${fallidas} ${fallidas === 1 ? "fallida" : "fallidas"} sin resolver`,
        estado: "problema",
        href: "/admin/noticia",
      };
    }

    const deHoy = programadas.filter(
      (fila) => fila.estado === "pendiente" && diaCaracasISO(new Date(fila.publicar_en).getTime()) === hoy,
    ).length;

    // Sin nada programado no se dice nada: una fila que solo repite "no hay
    // nada" en una lista de pendientes es ruido, y el panel ya tiene la
    // insignia de la cola en su tarjeta.
    if (deHoy === 0) return null;

    return {
      id: "cola",
      titulo: "Cola de publicaciones",
      detalle: `${deHoy} ${deHoy === 1 ? "programada" : "programadas"} para hoy`,
      estado: "esperando",
      href: "/admin/noticia",
    };
  } catch {
    return null;
  }
}

export interface AgendaHoy {
  fecha: string;
  tareas: TareaHoy[];
  /** Cuántas piden acción ahora mismo: es lo que decide si la agenda "grita". */
  porAtender: number;
}

export async function construirAgendaHoy(): Promise<AgendaHoy> {
  const ahora = Date.now();
  const hoy = diaCaracasISO(ahora);
  const hora = horaCaracas(ahora);

  const [tasas, parada, cola] = await Promise.all([
    tareasDeTasas(hoy, hora),
    tareaDeParada(hoy),
    tareaDeCola(hoy),
  ]);

  const tareas = [...tasas, parada, ...(cola ? [cola] : [])];

  return {
    fecha: hoy,
    tareas,
    porAtender: tareas.filter((t) => t.estado === "problema" || t.estado === "pendiente").length,
  };
}
