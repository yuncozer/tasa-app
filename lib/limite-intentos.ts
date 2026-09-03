/**
 * Límite de peticiones por clave, en memoria y con ventana deslizante.
 *
 * Existe por dos sitios que hasta ahora no tenían techo: el formulario de
 * `/admin/login`, donde una sola contraseña protege botones que publican en
 * la cuenta real, y `/api/eventos`, la única ruta pública que escribe en
 * Supabase.
 *
 * **Lo que este módulo no hace, y hay que tenerlo claro:** el contador vive
 * en la memoria de una instancia, así que en Vercel cada función tiene el
 * suyo y un reinicio lo borra — la misma limitación que ya tiene
 * `lib/cache.ts`, y por el mismo motivo (no hay estado compartido sin pagar
 * un viaje a Supabase en cada petición, que es justo lo que aquí se quiere
 * evitar). Detiene el bucle trivial de un script, no un ataque repartido
 * entre muchas IP. Se eligió así a sabiendas: el 99 % de lo que llega a una
 * app de este tamaño es lo primero.
 *
 * Las marcas de tiempo se guardan una a una en vez de llevar un contador con
 * su propio vencimiento: así la ventana es de verdad deslizante y no se
 * regala un cupo entero al cruzar un minuto redondo.
 */

interface Ventana {
  /** Momentos (ms) de las peticiones que aún caen dentro de la ventana. */
  marcas: number[];
}

const ventanas = new Map<string, Ventana>();

/**
 * Tope de claves distintas guardadas a la vez.
 *
 * Sin él, la propia defensa sería el ataque: cada IP nueva deja una entrada,
 * y quien varíe la cabecera `x-forwarded-for` llenaría la memoria de la
 * función. Al pasarse, se descarta la mitad más antigua — perder cuentas
 * viejas solo relaja el límite, que es el lado seguro del error.
 */
const MAX_CLAVES = 5_000;

export interface Resultado {
  /** Si esta petición cabe dentro del límite. */
  permitido: boolean;
  /** Cuántas van en la ventana, contando esta. */
  total: number;
  /** Si esta es exactamente la que agota el cupo (para avisar una sola vez). */
  primeraExcedida: boolean;
}

/**
 * Anota una petición y dice si cabe.
 *
 * Se llama **siempre**, también cuando ya se pasó del límite: si no, dejar de
 * contar durante el abuso haría que la ventana se vaciara sola mientras el
 * bucle sigue corriendo.
 */
export function registrar(clave: string, maximo: number, ventanaMs: number): Resultado {
  const ahora = Date.now();

  if (ventanas.size > MAX_CLAVES) purgar(ahora, ventanaMs);

  const ventana = ventanas.get(clave) ?? { marcas: [] };
  const vivas = ventana.marcas.filter((marca) => ahora - marca < ventanaMs);
  vivas.push(ahora);
  ventanas.set(clave, { marcas: vivas });

  const total = vivas.length;
  return {
    permitido: total <= maximo,
    total,
    primeraExcedida: total === maximo + 1,
  };
}

/** Borra el rastro de una clave. La usa el login tras un acceso correcto. */
export function limpiar(clave: string): void {
  ventanas.delete(clave);
}

/** Tira lo que ya no cuenta para nadie; si aun así sobra, tira lo más viejo. */
function purgar(ahora: number, ventanaMs: number): void {
  for (const [clave, ventana] of ventanas) {
    const ultima = ventana.marcas[ventana.marcas.length - 1] ?? 0;
    if (ahora - ultima >= ventanaMs) ventanas.delete(clave);
  }

  if (ventanas.size <= MAX_CLAVES) return;

  const porAntiguedad = [...ventanas.entries()].sort(
    (a, b) => (a[1].marcas.at(-1) ?? 0) - (b[1].marcas.at(-1) ?? 0),
  );
  for (const [clave] of porAntiguedad.slice(0, Math.floor(porAntiguedad.length / 2))) {
    ventanas.delete(clave);
  }
}

/**
 * La IP de quien pide, para usarla como clave.
 *
 * En Vercel llega en `x-forwarded-for`, donde el primer elemento es el
 * cliente y el resto son los saltos intermedios. La cabecera es falsificable
 * por definición, y eso está asumido: aquí no autentica a nadie, solo agrupa
 * peticiones. Sin ella, todo cae en la misma cesta `desconocida`, que es más
 * estricto y no menos.
 */
export function claveDeIp(request: Request, prefijo: string): string {
  const reenviada = request.headers.get("x-forwarded-for");
  const ip = reenviada?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconocida";
  return `${prefijo}:${ip}`;
}
