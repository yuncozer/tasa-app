import { proximoDiaHabilBcv } from "@/lib/feriados-ve";
import type { RateKey } from "@/lib/types";

/**
 * Formato de números en español de Venezuela: punto para miles, coma para
 * decimales. Los pesos se muestran sin decimales porque nadie cotiza centavos
 * de peso, y los bolívares con dos.
 */

const DECIMALS: Record<RateKey, number> = {
  USD_BCV: 2,
  USD_BINANCE_BUY: 2,
  USD_BINANCE_SELL: 2,
  EUR_BCV: 2,
  COP_OFICIAL: 0,
  COP_FRONTERA: 0,
  VES: 2,
};

export function formatAmount(value: number | null, key: RateKey): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const decimals = DECIMALS[key];
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Las tasas se muestran con más precisión que los montos: el peso vale
 * fracciones de bolívar y con dos decimales se perdería la diferencia entre el
 * cruce BCV y el de Binance.
 */
function rateDecimals(value: number): number {
  return value < 1 ? 4 : 2;
}

export function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const decimals = rateDecimals(value);
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Redondea una tasa a los mismos decimales con que se le muestra al usuario.
 *
 * Sin esto, `convert()` calcula con la precisión completa del proveedor
 * mientras el usuario solo puede verificar la cuenta con los decimales que ve
 * en pantalla, y los dos resultados no coinciden.
 */
export function roundToDisplayPrecision(value: number): number {
  return Number(value.toFixed(rateDecimals(value)));
}

/**
 * La inversa (pesos por bolívar) necesita más decimales que la tasa directa:
 * con solo 2 no vuelve a dar 1 al multiplicarla por la tasa que se muestra
 * (0,2328 Bs/peso ⇄ 4,30 pesos/Bs difieren ~0,1 %), y esa discrepancia se
 * nota al reproducir la cuenta a mano en sentido inverso.
 */
export function formatInverseRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(value);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Venezuela usa UTC−4 todo el año, sin horario de verano desde 2016. */
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * Fecha corta en hora de Caracas, p. ej. "3 ago, 12:30".
 *
 * Se arma a mano en vez de con `Intl.DateTimeFormat` porque servidor y
 * navegador pueden traer versiones distintas de ICU y devolver textos que no
 * coinciden ("12:00 a. m." frente a "12:00 a.m."), lo que rompía la hidratación.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "—";

  const caracas = new Date(date.getTime() - CARACAS_OFFSET_MS);

  return `${String(caracas.getUTCDate()).padStart(2, "0")}/${MESES[caracas.getUTCMonth()].toUpperCase()}/${caracas.getUTCFullYear()}`;
}

/**
 * Fecha corta de un día calendario que **ya** está en Caracas —el "YYYY-MM-DD"
 * que produce `diaCaracasISO()`, como el que guarda `historico_tasas`—, sin
 * volver a restar el huso horario. Restarlo de nuevo, como hace `formatDate`
 * con una fecha-hora completa, correría el día un día hacia atrás: aquí no
 * hay hora que convertir, la conversión ya se hizo al escribir el dato.
 */
export function formatFecha(fecha: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!partes) return "—";

  const [, anio, mes, dia] = partes;
  return `${dia}/${MESES[Number(mes) - 1].toUpperCase()}/${anio}`;
}

export function formatClock(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const caracas = new Date(date.getTime() - CARACAS_OFFSET_MS);
  // 1. Obtener la hora en base 24h
  const utcHours = caracas.getUTCHours();

  // 2. Determinar si es AM o PM
  const ampm = utcHours >= 12 ? 'PM' : 'AM';

  // 3. Convertir a formato 12 horas (0 se convierte en 12)
  const hour12 = utcHours % 12 || 12;

  const hora = String(hour12).padStart(2, "0");
  const minuto = String(caracas.getUTCMinutes()).padStart(2, "0");

  return `${hora}:${minuto} ${ampm}`;
}

/**
 * Traduce lo que escribe un `<input type="datetime-local">` ("2026-08-07T19:00")
 * a un instante ISO, interpretándolo **en hora de Caracas** y no en la del
 * dispositivo. Importa: desde Cúcuta el teléfono va en UTC−5, y un post que se
 * programa "para las 7" saldría corrido una hora.
 *
 * Devuelve `null` si el texto no tiene la forma que produce ese input.
 */
export function isoDesdeHoraCaracas(local: string): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!partes) return null;

  const [anio, mes, dia, hora, minuto] = partes.slice(1).map(Number);
  const instante = Date.UTC(anio, mes - 1, dia, hora, minuto) + CARACAS_OFFSET_MS;
  if (Number.isNaN(instante)) return null;

  return new Date(instante).toISOString();
}

/**
 * Día calendario en Caracas como "YYYY-MM-DD".
 *
 * Vive aquí, junto al resto de la aritmética de Caracas, en vez de exportar
 * `CARACAS_OFFSET_MS` para que cada módulo haga la cuenta por su lado: las
 * fechas de este proyecto se arman en un solo sitio.
 */
export function diaCaracasISO(ms: number): string {
  return new Date(ms - CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

/** El mismo formato, de vuelta: sirve para el `min` del input. */
export function horaCaracasDesdeIso(iso: string): string {
  const caracas = new Date(new Date(iso).getTime() - CARACAS_OFFSET_MS);
  const dosDigitos = (n: number) => String(n).padStart(2, "0");

  return (
    `${caracas.getUTCFullYear()}-${dosDigitos(caracas.getUTCMonth() + 1)}-${dosDigitos(caracas.getUTCDate())}` +
    `T${dosDigitos(caracas.getUTCHours())}:${dosDigitos(caracas.getUTCMinutes())}`
  );
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Día del calendario en Caracas, para comparar fechas sin fijarse en la hora. */
function diaCaracas(ms: number): number {
  return Math.floor((ms - CARACAS_OFFSET_MS) / DIA);
}

/**
 * Antigüedad del dato en lenguaje llano: "hace 2 días", "hace 3 horas".
 *
 * Contempla las fechas futuras porque el BCV publica su tasa con la fecha valor
 * del día siguiente: para esas, "hace" no tiene sentido y se dice "vigente
 * mañana".
 *
 * Solo se usa en componentes de servidor, así que el "ahora" se calcula una vez
 * al renderizar y no puede desajustarse con el navegador.
 */
export function formatRelative(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 0) {
    const dias = diaCaracas(date.getTime()) - diaCaracas(now);
    if (dias <= 0) return "vigente hoy";
    if (dias === 1) return "vigente mañana";
    return `vigente en ${dias} días`;
  }

  if (diff < MINUTO) return "hace un momento";

  if (diff < HORA) {
    const minutos = Math.floor(diff / MINUTO);
    return `hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  }

  if (diff < DIA) {
    const horas = Math.floor(diff / HORA);
    return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  }

  const dias = Math.floor(diff / DIA);
  if (dias < 30) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;

  const meses = Math.floor(dias / 30);
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Día calendario en Caracas (medianoche UTC), para operar con fechas sin hora. */
function fechaCaracas(ms: number): Date {
  const caracas = new Date(ms - CARACAS_OFFSET_MS);
  return new Date(Date.UTC(caracas.getUTCFullYear(), caracas.getUTCMonth(), caracas.getUTCDate()));
}

/**
 * Cuándo entra en vigencia una tasa del BCV, en lenguaje llano, solo cuando
 * no es ya hoy: "vigente mañana", o si el BCV publica en viernes, "vigente el
 * lunes" (o "vigente el martes" si el lunes es feriado).
 *
 * No usa la fecha valor tal cual la publica el BCV porque a veces cae en fin
 * de semana o feriado (el BCV no opera esos días); se resuelve primero al
 * próximo día hábil real con `proximoDiaHabilBcv` antes de describirla, así
 * "vigente mañana" nunca apunta a un sábado.
 */
export function vigenciaBcv(iso: string | null): string | undefined {
  if (!iso) return undefined;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;

  const objetivo = proximoDiaHabilBcv(fechaCaracas(date.getTime()));
  const hoy = fechaCaracas(Date.now());
  const diasDiferencia = Math.round((objetivo.getTime() - hoy.getTime()) / DIA);

  if (diasDiferencia <= 0) return undefined;
  if (diasDiferencia === 1) return "vigente mañana";

  return `vigente el ${DIAS_SEMANA[objetivo.getUTCDay()]}`;
}

const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Fecha larga en hora de Caracas, p. ej. "23 de agosto de 2026".
 *
 * Existe para que el video de tasas (`scripts/video-tasas.ts`) feche la pieza
 * con el mismo calendario que la app en vez de llevarse una copia de los
 * meses. Se arma a mano por el mismo motivo que `formatDate` y `formatClock`:
 * dos versiones de ICU devuelven textos distintos.
 */
export function formatFechaLarga(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const caracas = new Date(date.getTime() - CARACAS_OFFSET_MS);

  return `${caracas.getUTCDate()} de ${MESES_LARGOS[caracas.getUTCMonth()]} de ${caracas.getUTCFullYear()}`;
}

/**
 * Fecha corta en hora de Caracas, p. ej. "26 de Agosto": sin año, mes con
 * mayúscula inicial. La usa el título de la Historia automática
 * (`lib/og-shared.tsx`), donde el año no cabe en una frase corta y ya se
 * sobreentiende del propio día en que se publica.
 */
export function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const caracas = new Date(date.getTime() - CARACAS_OFFSET_MS);
  const mes = MESES_LARGOS[caracas.getUTCMonth()];

  return `${caracas.getUTCDate()} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
}

/**
 * Un porcentaje ya calculado, con su símbolo: "1,4 %".
 *
 * No usa `style: "percent"` de `Intl` porque ese espera una fracción (0,014) y
 * aquí el número ya viene en puntos, además de que el espacio antes del signo
 * cambia según la versión de ICU — lo mismo que obligó a armar las fechas a
 * mano.
 */
export function formatPercent(value: number | null, decimales = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const numero = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(value);

  return `${numero} %`;
}

/**
 * La magnitud de una variación semanal, con su unidad.
 *
 * Devuelve el **valor absoluto** a propósito: el signo lo comunican la flecha y
 * el color, y repetirlo en el texto daría un "↑ −1,4 %" contradictorio o un
 * "↑ +1,4 %" redundante. Con la dirección viviendo en un solo sitio, la imagen
 * y el caption no pueden acabar diciendo cosas distintas.
 *
 * La unidad no es cosmética: una tasa varía en porcentaje, pero la brecha ya
 * *es* un porcentaje, así que su cambio se mide en puntos porcentuales. Ver
 * `lib/semanal.ts`.
 */
export function formatVariacion(value: number | null, unidad: "porcentaje" | "puntos"): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const magnitud = Math.abs(value);
  if (unidad === "porcentaje") return formatPercent(magnitud);

  const numero = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(magnitud);

  return `${numero} pp`;
}

/**
 * El rango de una semana en lenguaje llano: "Lunes 10 — Domingo 16 de agosto",
 * o "Lunes 28 de julio — Domingo 3 de agosto" cuando cruza de mes.
 *
 * Recibe días de Caracas ya resueltos ("YYYY-MM-DD", como los produce
 * `diaCaracasISO`), así que no vuelve a convertir zonas: parsea los tres
 * números y calcula el día de la semana en UTC.
 *
 * Se arma a mano, sin `Intl.DateTimeFormat`, por la regla dura del proyecto —y
 * aquí además el texto viaja a Satori, que es un entorno más con su propio ICU.
 * La inicial se capitaliza en la propia cadena y no con CSS porque el mismo
 * texto lo usa el caption, donde no hay CSS que valga.
 */
export function rangoSemana(desde: string, hasta: string): string {
  const inicio = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return "—";

  const nombre = (fecha: Date) => {
    const dia = DIAS_SEMANA[fecha.getUTCDay()];
    return dia.charAt(0).toUpperCase() + dia.slice(1);
  };

  const mesInicio = MESES_LARGOS[inicio.getUTCMonth()];
  const mesFin = MESES_LARGOS[fin.getUTCMonth()];

  // Dentro del mismo mes el nombre se dice una sola vez, al final.
  const izquierda =
    mesInicio === mesFin
      ? `${nombre(inicio)} ${inicio.getUTCDate()}`
      : `${nombre(inicio)} ${inicio.getUTCDate()} de ${mesInicio}`;

  return `${izquierda} — ${nombre(fin)} ${fin.getUTCDate()} de ${mesFin}`;
}

/** Convierte lo tecleado en la calculadora ("1.234,56") a número. */
export function parseInput(raw: string): number {
  if (!raw) return 0;
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Traduce un monto pegado desde fuera al formato que teclea la calculadora
 * ("1234,56": coma decimal y sin separadores de miles).
 *
 * Existe porque el teclado propio no permite pegar, y un monto llega casi
 * siempre copiado de un chat: con símbolo delante ("Bs 1.234,56"), en formato
 * venezolano ("1.234,56") o en el inglés que produce media internet
 * ("1,234.56"). Los tres tienen que dar el mismo número.
 *
 * El separador decimal **no se decide por el carácter** —la coma es decimal
 * aquí y de miles en inglés— sino por el contexto, en dos pasos:
 *
 * 1. Si aparecen los dos signos, el **último** es el decimal y el otro agrupa
 *    miles. Vale para "1.234,56" y para "1,234.56" sin tener que saber de qué
 *    país viene el texto, y también para "1.234,567", donde el punto anterior
 *    ya delata que la coma no puede ser de miles.
 * 2. Si solo aparece uno, es separador de miles **únicamente** cuando le siguen
 *    exactamente tres cifras y delante hay algo distinto de cero: un grupo de
 *    miles siempre tiene tres cifras, así que "1.234" son mil doscientos
 *    treinta y cuatro (el caso que un `Number()` a secas lee al revés), pero
 *    "0,2993" —la tasa del peso frontera— son cuatro cifras y no puede serlo,
 *    y "0,123" tampoco, porque nadie agrupa miles detrás de un cero solo.
 *
 * Devuelve `null` cuando no queda nada aprovechable, para que quien llama
 * distinga "no había un monto" de "el monto era cero".
 */
export function normalizarMontoPegado(
  texto: string,
  maxEnteros: number,
  maxDecimales: number,
): string | null {
  // Fuera todo lo que no sea cifra o separador: símbolos, espacios (incluido el
  // duro que arrastran algunos formatos) y cualquier texto que venga pegado.
  const limpio = texto.replace(/[^\d.,]/g, "");
  if (!limpio) return null;

  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  const ultimoSeparador = Math.max(ultimaComa, ultimoPunto);
  const hayAmbos = ultimaComa !== -1 && ultimoPunto !== -1;
  const cifrasDetras = ultimoSeparador === -1 ? 0 : limpio.length - ultimoSeparador - 1;
  // Un grupo de miles son tres cifras y nunca va detrás de un cero solo.
  const pareceMiles =
    cifrasDetras === 3 && !/^0*$/.test(limpio.slice(0, ultimoSeparador).replace(/[.,]/g, ""));
  const esDecimal =
    ultimoSeparador !== -1 && cifrasDetras >= 1 && (hayAmbos || !pareceMiles);

  const enteros = (esDecimal ? limpio.slice(0, ultimoSeparador) : limpio).replace(/[.,]/g, "");
  const decimales = esDecimal ? limpio.slice(ultimoSeparador + 1) : "";

  if (!enteros && !decimales) return null;

  // Los ceros a la izquierda se caen solos, y un monto más largo que el tope se
  // recorta por la derecha en vez de rechazarse: quien pega quiere ese número,
  // no un campo vacío.
  const enterosNormalizados = (enteros.replace(/^0+(?=\d)/, "") || "0").slice(0, maxEnteros);

  return decimales
    ? `${enterosNormalizados},${decimales.slice(0, maxDecimales)}`
    : enterosNormalizados;
}

/**
 * Un conteo entero con separador de miles: "12.480".
 *
 * Los números sí usan `Intl.NumberFormat` —es lo único que no dio problemas de
 * hidratación entre versiones de ICU— y aquí no hay decimales que decidir: una
 * visita o una conversión no se cuenta a medias.
 *
 * Sin dato devuelve el mismo guion largo que el resto de formateadores, para
 * que "no hay medición" no se lea como un cero.
 */
export function formatEntero(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(value);
}
