import type { AnaliticasWeb } from "@/lib/analiticas-web";

/**
 * Las cifras con las que se cotiza un patrocinio, y solo esas.
 *
 * El panel ya medía el uso de la app, pero ninguna de esas cifras responde lo
 * que pregunta quien va a pagar. "1.240 visitas" no significa nada para una
 * casa de cambio: lo que quiere saber es **cuánta gente ve algo un día
 * cualquiera**, **si esa gente opera o solo mira** y **si se lleva el
 * resultado a algún sitio**. Son las mismas filas de `eventos_web`, leídas con
 * otra pregunta.
 *
 * Tres reglas, heredadas de `lib/consejos-instagram.ts`:
 *
 * - **Nada se inventa ni se estima.** Todo sale de lo medido. Lo que no se
 *   mide se dice que no se mide (ver `LO_QUE_NO_SABEMOS`), porque un número
 *   inventado en una conversación comercial es la clase de error que se paga
 *   una sola vez.
 * - **Sin muestra suficiente no hay ficha.** Por debajo de `MINIMO_SESIONES`
 *   los porcentajes bailan tanto que decirlos es peor que callarlos: con
 *   nueve sesiones, una que convierta mueve la cifra once puntos.
 * - **Cada cifra viene con la cuenta que la sostiene**, para poder
 *   contrastarla en la misma pantalla en vez de tener que creérsela.
 */

/**
 * Por debajo de esto la ficha no se muestra.
 *
 * No es un umbral estadístico fino: es el punto en el que un porcentaje deja
 * de moverse a saltos con cada sesión suelta. Con menos, la pantalla dice
 * cuántas faltan en vez de enseñar cifras que no se sostienen.
 */
export const MINIMO_SESIONES = 100;

export interface CifraAnunciante {
  clave: string;
  etiqueta: string;
  valor: number | null;
  /** La cuenta de la que sale, para poder contrastarla sin salir de la pantalla. */
  soporte: string;
  /** Qué significa para quien va a pagar. */
  lectura: string;
}

export interface FichaAnunciante {
  /** `false` cuando la muestra todavía no da; el resto de campos siguen siendo válidos. */
  suficiente: boolean;
  sesiones: number;
  /** Cuántas sesiones faltan para llegar al mínimo. `0` si ya se llegó. */
  faltan: number;
  dias: number;
  cifras: CifraAnunciante[];
}

/**
 * Lo que esta app **no** puede decir de su audiencia, y conviene tener a mano
 * antes de una conversación comercial.
 *
 * No es un descargo de responsabilidad: es la consecuencia directa de que
 * `eventos_web` sea anónima por diseño —sin IP, sin user-agent, sin nada que
 * el usuario teclee— y de que la `sesion` muera con la pestaña. Prometer
 * cualquiera de estas cosas obligaría a empezar a guardarlas.
 */
export const LO_QUE_NO_SABEMOS = [
  "Edad, sexo ni ubicación: no se guarda IP ni nada que identifique a nadie.",
  "Personas únicas: la sesión muere al cerrar la pestaña, así que quien vuelve mañana cuenta de nuevo.",
  "Qué montos se consultan: el monto es asunto del usuario y no se registra, solo la moneda.",
];

function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? (parte / total) * 100 : null;
}

function media(valores: number[]): number | null {
  return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

export function construirFichaAnunciante(datos: AnaliticasWeb): FichaAnunciante {
  const { totales, serie } = datos;
  const dias = serie.length;
  // `sesionesSitio` y no `sesiones`: aquel total incluye una sesión inventada
  // por cada clic en un atajo, o sea gente que se está yendo del sitio. Es la
  // primera cifra que alguien comprobaría, y estaba un 40 % por encima.
  const sesiones = totales.sesionesSitio;

  const sesionesPorDia = serie.map((dia) => dia.sesionesSitio);
  const pico = sesionesPorDia.length > 0 ? Math.max(...sesionesPorDia) : null;

  const cifras: CifraAnunciante[] = [
    {
      clave: "alcance-diario",
      etiqueta: "Personas al día",
      // La media diaria y no el total del período: es la cifra con la que se
      // habla ("unos X al día"), y la única que no cambia de significado al
      // comparar dos períodos de distinta longitud.
      valor: media(sesionesPorDia),
      soporte: `Media de ${dias} días · máximo ${pico ?? "—"} en un día`,
      lectura: "Cuánta gente distinta abre la app en una jornada normal.",
    },
    {
      clave: "operan",
      etiqueta: "Llegan a operar",
      valor: porcentaje(totales.sesionesQueConvierten, sesiones),
      soporte: `${totales.sesionesQueConvierten} de ${sesiones} sesiones hicieron al menos una conversión`,
      lectura: "No es tráfico de paso: entra con una cuenta que hacer.",
    },
    {
      clave: "se-la-llevan",
      etiqueta: "Se llevan la cifra",
      valor: porcentaje(totales.sesionesQueSeLlevanLaCifra, sesiones),
      soporte: `${totales.sesionesQueSeLlevanLaCifra} de ${sesiones} sesiones copiaron o compartieron un monto`,
      lectura: "El resultado sale de aquí hacia un chat: es la intención más fuerte que se puede medir.",
    },
    {
      clave: "instalada",
      etiqueta: "Desde la app instalada",
      valor: porcentaje(totales.sesionesInstaladas, sesiones),
      soporte: `${totales.sesionesInstaladas} de ${sesiones} sesiones venían del icono en la pantalla de inicio`,
      lectura: "Audiencia que vuelve por su cuenta, no tráfico comprado ni de una sola vez.",
    },
    {
      clave: "salidas",
      etiqueta: "Clics a enlaces propios",
      valor: totales.atajos,
      soporte: `Clics en /hoy, /wa, /ig y /laparada en ${dias} días`,
      lectura: "Prueba de que esta audiencia sí pulsa cuando se le ofrece algo.",
    },
  ];

  return {
    suficiente: sesiones >= MINIMO_SESIONES,
    sesiones,
    faltan: Math.max(0, MINIMO_SESIONES - sesiones),
    dias,
    cifras,
  };
}
