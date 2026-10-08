/**
 * La cuenta que se teclea en la calculadora: un monto, o varios montos
 * unidos por `+ − × ÷`.
 *
 * Vive aparte de `components/Calculator.tsx` porque es lógica pura —sin React,
 * sin DOM— y es justo la parte donde un error cuesta caro: una suma mal hecha
 * se convierte en una cifra equivocada en tres monedas. Así se puede probar
 * sin montar la pantalla.
 *
 * **La cuenta es un texto**, el mismo que ya era el monto ("1234,5"), con los
 * operadores intercalados ("100+250,5×2"). Teclear solo un monto produce
 * exactamente lo de antes, y de ahí que quien no use los operadores no note
 * ningún cambio. Los operandos usan la coma decimal y no llevan separador de
 * miles: ese se pone solo al mostrarlos.
 *
 * Los operadores son los propios símbolos (`−` es el signo menos tipográfico,
 * no el guion) para que lo tecleado, lo que se ve y lo que se evalúa sean la
 * misma cadena.
 */

export type Operador = "+" | "−" | "×" | "÷";

export const OPERADORES: readonly Operador[] = ["+", "−", "×", "÷"];

/** Máximo de dígitos enteros de cada operando: evita que el visor se desborde. */
export const MAX_ENTEROS = 12;
export const MAX_DECIMALES = 2;
/** Largo máximo de toda la cuenta, para que quepa en el visor sin romper el diseño. */
const MAX_LARGO = 40;

/** Por encima de esto un resultado ya no cabe en 12 dígitos enteros. */
const LIMITE = 10 ** MAX_ENTEROS;

export function esOperador(texto: string): texto is Operador {
  return (OPERADORES as readonly string[]).includes(texto);
}

/** Si la cuenta tiene al menos un operador, es decir, si es algo más que un monto. */
export function tieneOperador(cuenta: string): boolean {
  return OPERADORES.some((operador) => cuenta.includes(operador));
}

/** Si lo último tecleado es un operador, que espera su segundo operando. */
export function terminaEnOperador(cuenta: string): boolean {
  return cuenta !== "" && esOperador(cuenta[cuenta.length - 1]);
}

/** Dónde empieza el último operando: justo después del último operador. */
function inicioDelOperando(cuenta: string): number {
  return Math.max(...OPERADORES.map((operador) => cuenta.lastIndexOf(operador))) + 1;
}

/**
 * Aplica una tecla a la cuenta.
 *
 * - Un operador sin nada delante se ignora: no hay a qué aplicarlo.
 * - Dos operadores seguidos no se acumulan, el segundo **reemplaza** al
 *   primero: es lo que hace quien se equivocó de tecla y vuelve a pulsar.
 * - Una coma que quedó colgando antes del operador ("5,+") se descarta.
 * - Cada operando respeta los mismos topes que tenía el monto solo.
 */
export function aplicarTecla(cuenta: string, tecla: string): string {
  if (tecla === "back") return cuenta.slice(0, -1);

  if (esOperador(tecla)) {
    if (cuenta === "") return cuenta;
    if (terminaEnOperador(cuenta)) return cuenta.slice(0, -1) + tecla;

    const base = cuenta.endsWith(",") ? cuenta.slice(0, -1) : cuenta;
    return base.length + 1 > MAX_LARGO ? cuenta : base + tecla;
  }

  if (cuenta.length >= MAX_LARGO) return cuenta;

  const inicio = inicioDelOperando(cuenta);
  const previo = cuenta.slice(0, inicio);
  const operando = cuenta.slice(inicio);

  if (tecla === ",") {
    if (operando.includes(",")) return cuenta;
    return operando === "" ? `${previo}0,` : `${cuenta},`;
  }

  const [entero, decimales] = operando.split(",");
  if (decimales !== undefined) {
    return decimales.length >= MAX_DECIMALES ? cuenta : `${cuenta}${tecla}`;
  }
  if (entero.length >= MAX_ENTEROS) return cuenta;
  // "0" solo se conserva como parte de un decimal.
  if (entero === "0") return `${previo}${tecla}`;

  return `${cuenta}${tecla}`;
}

export type ErrorCuenta = "cero" | "negativo" | "grande";

export type Resultado = { valor: number; error: null } | { valor: null; error: ErrorCuenta };

/**
 * Evalúa la cuenta con la precedencia de siempre: primero `×` y `÷`, luego
 * `+` y `−`. Se hace así y no de izquierda a derecha porque la cuenta se ve
 * entera en el visor, y con ella a la vista `100 + 10 × 2 = 120` es lo que
 * cualquiera espera leer.
 *
 * El resultado se **redondea a dos decimales**, que es la precisión con que se
 * muestra: lo que se convierte es lo que se ve, y quien repita la cuenta a
 * mano con esa cifra obtiene el mismo número. Es la misma regla que ya
 * gobierna a `bsPerUnit` y evita de paso que `0,1 + 0,2` dé `0,30000000000000004`.
 *
 * Tres casos no tienen resultado y se dicen en vez de mostrarse como un cero:
 * dividir entre cero, un resultado negativo (en un monto a cambiar casi
 * siempre es un error de tecleo) y uno que ya no cabe en el visor.
 *
 * Un operador colgando al final ("100+") se ignora: la cuenta vale lo que
 * valía antes de pulsarlo.
 */
export function evaluar(cuenta: string): Resultado {
  const piezas = cuenta.split(/([+−×÷])/);
  // Con un operador al final queda un operando vacío; se retira junto con él.
  if (piezas[piezas.length - 1] === "") {
    piezas.pop();
    piezas.pop();
  }
  if (piezas.length === 0) return { valor: 0, error: null };

  const numeros: number[] = [Number(piezas[0].replace(",", ".")) || 0];
  const sumas: Operador[] = [];

  // Primera pasada: `×` y `÷` se resuelven en el sitio contra el número anterior.
  for (let i = 1; i < piezas.length; i += 2) {
    const operador = piezas[i] as Operador;
    const siguiente = Number(piezas[i + 1].replace(",", ".")) || 0;

    if (operador === "×") {
      numeros[numeros.length - 1] *= siguiente;
    } else if (operador === "÷") {
      if (siguiente === 0) return { valor: null, error: "cero" };
      numeros[numeros.length - 1] /= siguiente;
    } else {
      sumas.push(operador);
      numeros.push(siguiente);
    }
  }

  // Segunda pasada: lo que quedó son solo sumas y restas.
  let total = numeros[0];
  sumas.forEach((operador, i) => {
    total += operador === "+" ? numeros[i + 1] : -numeros[i + 1];
  });

  const redondeado = Math.round((total + Number.EPSILON) * 100) / 100;
  if (redondeado < 0) return { valor: null, error: "negativo" };
  if (redondeado >= LIMITE) return { valor: null, error: "grande" };

  // `+ 0` para no devolver un `-0`.
  return { valor: redondeado + 0, error: null };
}

/** Lo que se le dice al usuario cuando la cuenta no tiene resultado. */
export const MENSAJE_ERROR: Record<ErrorCuenta, string> = {
  cero: "No se puede dividir entre cero",
  negativo: "El resultado es negativo",
  grande: "El resultado es demasiado grande",
};

/** Agrupa los miles de un operando para que se lea "74.878,64". */
function conMiles(operando: string): string {
  if (operando === "") return "";
  const [entero, decimales] = operando.split(",");
  const agrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimales === undefined ? agrupado : `${agrupado},${decimales}`;
}

/** La cuenta como se muestra: operandos con miles y operadores con aire alrededor. */
export function formatoCuenta(cuenta: string): string {
  return cuenta
    .split(/([+−×÷])/)
    .map((pieza) => (esOperador(pieza) ? ` ${pieza} ` : conMiles(pieza)))
    .join("");
}
