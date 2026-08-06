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

/**
 * Una tasa expresada en pesos, no en bolívares (post diario de Instagram en
 * pesos). El criterio es el mismo de `rateDecimals`, solo que corrido de
 * escala: como un peso vale mucho menos que un bolívar, la frontera entre "hace
 * falta precisión" y "sobra" no está en 1 sino en 100. Un dólar ronda los
 * 3.100 COP y con dos decimales ya es exacto de sobra; un bolívar ronda los 4
 * COP y con dos decimales se perdería la diferencia entre una jornada y otra.
 */
function copRateDecimals(value: number): number {
  return value < 100 ? 4 : 2;
}

export function formatCopRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";

  const decimals = copRateDecimals(value);
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

/** Convierte lo tecleado en la calculadora ("1.234,56") a número. */
export function parseInput(raw: string): number {
  if (!raw) return 0;
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}
