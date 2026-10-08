import { ChevronDown } from "lucide-react";
import { Flag, type Pais } from "@/components/Flag";
import { formatDate, formatInverseRate, formatRate, formatRelative } from "@/lib/format";

interface RateCardProps {
  label: string;
  /** País de la moneda, para dibujar su bandera (decorativa). */
  flag: Pais;
  /** Ruta a un logo adicional junto a la bandera, p. ej. el de Binance en el P2P. */
  platformLogo?: string;
  /** Cuánto vale una unidad en `unidad`. `null` si la fuente falló. */
  valor: number | null;
  /** Moneda en que se expresa `valor`: "Bs" en el tablero en bolívares, "COP" en el de pesos. */
  unidad?: "Bs" | "COP";
  /** Qué significa este monto, para el panel que se abre al tocar la fila. */
  help?: string;
  source: string;
  updatedAt: string | null;
  /** Detalle propio de la tasa, p. ej. la operación de referencia del P2P. */
  note?: string;
  /** Qué es esta tasa, en una frase. Va dentro del panel, no en un tooltip. */
  description?: string;
  /**
   * Valor inverso (p. ej. pesos por bolívar). Solo lo usan las filas de peso.
   */
  inverse?: { value: number | null; prefix: string; help?: string; symbol: string };
}

/**
 * Una tasa del día, como una fila del tablero.
 *
 * Es la misma información que antes ocupaba una tarjeta entera, ordenada por
 * lo que se necesita de un vistazo: **qué moneda es, cuánto vale y qué tan
 * vieja es la cifra**. Todo lo demás —la operación de referencia del P2P, el
 * inverso del peso, la fecha exacta, las explicaciones que antes colgaban de
 * ocho íconos ⓘ— está un toque más abajo, dentro de un `<details>`.
 *
 * `<details>` y no un estado de React: abre y cierra sin JavaScript, así que
 * esta fila sigue siendo un componente de servidor y funciona igual cuando el
 * teléfono no ha terminado de cargar los scripts.
 *
 * **La antigüedad no se esconde.** Es la única regla dura de estas pantallas
 * (una tasa vieja servida como fresca es el daño que la app no puede causar),
 * así que "fuente · hace X" va siempre en la segunda línea, sin abrir nada.
 */
export function RateCard({
  label,
  flag,
  platformLogo,
  valor,
  unidad = "Bs",
  help,
  source,
  updatedAt,
  note,
  description,
  inverse,
}: RateCardProps) {
  const unavailable = valor === null;
  const hayDetalle = Boolean(description || note || inverse || help) || !unavailable;

  return (
    <li className={unavailable ? "bg-warning/5" : undefined}>
      <details className="group">
        {/* Cuadrícula y no una fila flex: el nombre y la cifra comparten la
            primera línea, con la cifra a la derecha, y "fuente · hace X" ocupa
            la segunda **a todo el ancho**. La cuadrícula va en un `div` dentro
            del `summary` y no en el `summary` mismo: ese elemento tiene un
            comportamiento de pantalla propio y en escritorio la cuadrícula se
            le deshacía, apilando nombre, cifra y flecha en una sola columna. */}
        <summary
          className={`block px-4 py-3 transition active:bg-surface-strong/60 [&::-webkit-details-marker]:hidden ${
            hayDetalle ? "cursor-pointer" : ""
          } list-none`}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1">
            <h3 className="flex items-start gap-1.5 text-sm font-medium leading-snug">
              {/* La bandera acompaña al nombre; el lector de pantalla ya lee la moneda. */}
              <Flag pais={flag} className="mt-[3px] shrink-0" />
              {/* El P2P no es una tasa de ningún país: el logo de la plataforma
                  va aparte de la bandera. */}
              {platformLogo && (
                // eslint-disable-next-line @next/next/no-img-element -- SVG estático y decorativo.
                <img src={platformLogo} alt="" width={16} height={16} className="mt-0.5 shrink-0" />
              )}
              {/* Sin `truncate`: "Dólar Binance (compra)" y "(venta)" solo se
                  distinguen al final, y recortado no se sabe cuál es cuál. */}
              <span>{label}</span>
            </h3>

            {unavailable ? (
              <span aria-hidden="true" />
            ) : (
              <p className="tabular flex items-baseline gap-1.5 text-xl font-semibold leading-none sm:text-2xl">
                <span>{formatRate(valor)}</span>
                <span className="text-sm font-normal text-muted">{unidad}</span>
              </p>
            )}

            {hayDetalle ? (
              <ChevronDown
                aria-hidden="true"
                className="size-4 text-muted transition group-open:rotate-180"
              />
            ) : (
              <span aria-hidden="true" />
            )}

            {unavailable ? (
              <p className="col-span-3 text-xs text-warning">Dato no disponible ahora mismo</p>
            ) : (
              // La fecha exacta queda en el título, al alcance del ratón.
              <p className="col-span-3 text-xs text-muted" title={formatDate(updatedAt)}>
                {source} · {formatRelative(updatedAt)}
              </p>
            )}
          </div>
        </summary>

        {hayDetalle && (
          <div className="flex flex-col gap-2 px-4 pb-3 text-xs leading-relaxed text-muted">
            {description && <p>{description}</p>}
            {note && <p>{note}</p>}
            {help && <p>{help}</p>}
            {inverse && inverse.value !== null && (
              <p>
                <strong className="tabular font-semibold text-foreground">
                  {inverse.prefix} {formatInverseRate(inverse.value)} {inverse.symbol}
                </strong>
                {inverse.help && <> · {inverse.help}</>}
              </p>
            )}
            {!unavailable && <p>Dato de {formatDate(updatedAt)}</p>}
          </div>
        )}
      </details>
    </li>
  );
}
