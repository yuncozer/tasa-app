"use client";

/**
 * Registro de eventos propios de la calculadora.
 *
 * Vercel Analytics cuenta visitas y rutas, y ahí se acaba: no sabe qué es una
 * conversión en esta app, ni con qué moneda se hace, ni cuántas veces se copia
 * una cifra para mandarla por WhatsApp. Esas son las preguntas que de verdad
 * dicen si la app sirve, así que se registran aquí y se leen desde
 * `/admin/analiticas`.
 *
 * Tres reglas que no se negocian:
 *
 * - **Anónimo por diseño.** No viaja IP, ni user-agent, ni nada tecleado por
 *   el usuario. `sesion` es un identificador aleatorio de la pestaña: existe
 *   solo para no contar diez veces a quien prueba diez montos seguidos, y
 *   muere al cerrarla.
 * - **Nunca puede estorbar.** Se manda con `sendBeacon`, que el navegador
 *   encola y envía por su cuenta —no bloquea la interacción ni falla si la
 *   página se cierra a mitad—, y cualquier error se traga. Un fallo de la
 *   analítica no puede romper una conversión.
 * - **Nada de esto se registra sin red.** Es la contrapartida asumida de no
 *   guardar una cola en el dispositivo: la app se usa con señal intermitente
 *   y una cola de eventos viejos reenviados horas después falsearía la hora a
 *   la que ocurrieron, que es la mitad de lo que se está midiendo.
 */

/** Conjunto cerrado: la ruta del servidor rechaza cualquier otro. */
export type TipoEvento =
  | "visita"
  | "conversion"
  | "copiar"
  | "compartir"
  | "avisos"
  | "pegar"
  | "actualizar"
  | "instalar"
  | "sin_conexion";

const CLAVE_SESION = "tasapp:sesion";

/** Respaldo en memoria: Safari en navegación privada lanza al tocar el storage. */
let sesionEnMemoria: string | null = null;

function idSesion(): string {
  if (sesionEnMemoria) return sesionEnMemoria;

  try {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    if (guardada) {
      sesionEnMemoria = guardada;
      return guardada;
    }
  } catch {
    // Se sigue con uno nuevo en memoria: sin persistencia cada recarga cuenta
    // como sesión aparte, que es un error de conteo pequeño y conocido.
  }

  const nueva = crypto.randomUUID();
  sesionEnMemoria = nueva;
  try {
    sessionStorage.setItem(CLAVE_SESION, nueva);
  } catch {
    // Ídem.
  }
  return nueva;
}

function esMovil(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Si la visita viene de la app instalada y no del navegador. */
function estaInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean(navigator.standalone))
  );
}

/**
 * Solo el host de quien refirió la visita, nunca la URL completa: el host ya
 * dice si el tráfico viene de Instagram o de WhatsApp, y la ruta de origen
 * puede llevar identificadores de campaña o de conversación.
 */
function referente(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname;
    return host === location.hostname ? undefined : host;
  } catch {
    return undefined;
  }
}

export function registrarEvento(tipo: TipoEvento, detalle?: string): void {
  if (typeof window === "undefined") return;

  try {
    const cuerpo = JSON.stringify({
      tipo,
      detalle,
      // Sin query string: el `?actualizar=<marca>` de la portada convertiría
      // cada refresco en una ruta distinta y llenaría el listado de ruido.
      ruta: location.pathname,
      sesion: idSesion(),
      dispositivo: esMovil() ? "movil" : "escritorio",
      instalada: estaInstalada(),
      referente: referente(),
    });

    // `sendBeacon` va con `text/plain` a propósito: como `application/json`
    // dispara la comprobación previa de CORS, que en un beacon no se puede
    // esperar. La ruta lee el cuerpo con `text()` y lo parsea ella.
    const enviado = navigator.sendBeacon?.("/api/eventos", new Blob([cuerpo], { type: "text/plain" }));
    if (enviado) return;

    // Navegadores sin `sendBeacon`: `keepalive` da la misma garantía de que
    // el envío sobrevive al cierre de la página.
    void fetch("/api/eventos", { method: "POST", body: cuerpo, keepalive: true }).catch(() => {});
  } catch {
    // Una analítica que lanza es peor que una analítica que falta.
  }
}
