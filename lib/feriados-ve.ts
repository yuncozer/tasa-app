/**
 * Feriados nacionales de Venezuela, para saber si el BCV opera un día dado.
 *
 * Los fijos (Ley Orgánica del Trabajo y decretos que se repiten cada año) se
 * listan a mano. Los móviles —Carnaval y Semana Santa— se calculan a partir
 * del Domingo de Resurrección con el algoritmo de Meeus/Jones/Butcher
 * (calendario gregoriano) en vez de mantener una tabla que haya que
 * actualizar cada año. Verificado contra los feriados oficiales de 2026:
 * Carnaval 16-17 feb y Semana Santa 2-3 abr coinciden exactamente con lo
 * que da la fórmula a partir de la Pascua (5 de abril de 2026).
 *
 * El 24 y el 31 de diciembre no son feriados de ley sino que el Ejecutivo
 * los decreta como no laborables casi todos los años; se incluyen aquí por
 * ser la norma, pero podrían no decretarse algún año — no hay forma de
 * saberlo con anticipación sin una fuente oficial que lo confirme año a año.
 *
 * Los feriados venezolanos se celebran en su fecha exacta y no se trasladan
 * de día cuando caen en fin de semana, así que no hace falta esa lógica
 * aparte: caer en sábado o domingo ya los cubre `esDiaHabilBcv`.
 *
 * Las fechas se representan como `Date` ancladas a medianoche UTC: aquí solo
 * importan año/mes/día, nunca una hora exacta, así que evita cualquier lío
 * de huso horario al compararlas. Quien llame con una fecha real (con hora)
 * debe convertirla primero a su día calendario correspondiente.
 */

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha.getTime());
  copia.setUTCDate(copia.getUTCDate() + dias);
  return copia;
}

function clave(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Domingo de Resurrección de un año dado (algoritmo de Meeus/Jones/Butcher). */
function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function feriadosDelAnio(anio: number): Set<string> {
  const pascua = domingoDePascua(anio);

  const fijos = [
    new Date(Date.UTC(anio, 0, 1)), // Año Nuevo
    new Date(Date.UTC(anio, 3, 19)), // Declaración de la Independencia
    new Date(Date.UTC(anio, 4, 1)), // Día del Trabajador
    new Date(Date.UTC(anio, 5, 24)), // Batalla de Carabobo
    new Date(Date.UTC(anio, 6, 5)), // Día de la Independencia
    new Date(Date.UTC(anio, 6, 24)), // Natalicio de Bolívar
    new Date(Date.UTC(anio, 9, 12)), // Día de la Resistencia Indígena
    new Date(Date.UTC(anio, 11, 24)), // Nochebuena (no laborable por decreto habitual)
    new Date(Date.UTC(anio, 11, 25)), // Navidad
    new Date(Date.UTC(anio, 11, 31)), // Fin de año (no laborable por decreto habitual)
  ];

  const moviles = [
    sumarDias(pascua, -48), // Lunes de Carnaval
    sumarDias(pascua, -47), // Martes de Carnaval
    sumarDias(pascua, -3), // Jueves Santo
    sumarDias(pascua, -2), // Viernes Santo
  ];

  return new Set([...fijos, ...moviles].map(clave));
}

/** `fecha` es un día calendario (año/mes/día); la hora se ignora. */
export function esDiaHabilBcv(fecha: Date): boolean {
  const diaSemana = fecha.getUTCDay(); // 0 = domingo, 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) return false;

  return !feriadosDelAnio(fecha.getUTCFullYear()).has(clave(fecha));
}

/** El primer día hábil del BCV a partir de `fecha` (inclusive). */
export function proximoDiaHabilBcv(fecha: Date): Date {
  let candidato = fecha;
  while (!esDiaHabilBcv(candidato)) {
    candidato = sumarDias(candidato, 1);
  }
  return candidato;
}
