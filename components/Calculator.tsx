"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConversionResults } from "@/components/ConversionResults";
import { Keypad, type KeypadKey } from "@/components/Keypad";
import { convert } from "@/lib/convert";
import { normalizarMontoPegado, parseInput } from "@/lib/format";
import {
  guardarMoneda,
  monedaEnServidor,
  monedaGuardada,
  suscribirMoneda,
} from "@/lib/preferencia-moneda";
import { RATE_ORDER } from "@/lib/rates";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/** Máximo de dígitos enteros: evita que el display se desborde. */
const MAX_INTEGER_DIGITS = 12;
const MAX_DECIMALS = 2;

/**
 * La primera base que hoy tiene precio, en el orden en que se muestran.
 *
 * El origen no puede quedarse apuntando a una tasa caída: sus botones se
 * deshabilitan, así que el usuario no tendría cómo salir de ahí y la
 * calculadora entera mostraría "—" (`convert()` devuelve `null` en todos los
 * destinos cuando el origen es nulo). Pasaba con el arranque en `USD_BCV`, que
 * es la tasa más frágil de todas: se raspa de la portada del BCV.
 *
 * Siempre encuentra alguna, porque `VES` vale 1 por construcción y nunca es
 * nula; el `?? "USD_BCV"` es solo para no devolver `undefined` si algún día
 * eso cambia.
 */
function primeraDisponible(snapshot: RatesSnapshot): RateKey {
  return RATE_ORDER.find((key) => snapshot.rates[key].bsPerUnit !== null) ?? "USD_BCV";
}

/**
 * Si este navegador deja leer el portapapeles.
 *
 * Se consulta con `useSyncExternalStore` y no en el propio render porque en el
 * servidor no existe `navigator`: declarar aparte el valor del servidor es lo
 * que evita el desajuste de hidratación, el mismo motivo por el que se lee así
 * la preferencia de moneda. No hay a qué suscribirse —la capacidad no cambia
 * mientras la página vive—, de ahí la baja vacía.
 */
const sinCambios = () => () => {};
const hayPortapapeles = () => typeof navigator?.clipboard?.readText === "function";
const noEnServidor = () => false;

/** Aplica una tecla al monto que se está escribiendo. */
function applyKey(current: string, key: KeypadKey): string {
  if (key === "back") return current.slice(0, -1);

  if (key === ",") {
    if (current.includes(",")) return current;
    return current === "" ? "0," : `${current},`;
  }

  const [integer, decimals] = current.split(",");
  if (decimals !== undefined) {
    if (decimals.length >= MAX_DECIMALS) return current;
    return `${current}${key}`;
  }
  if (integer.length >= MAX_INTEGER_DIGITS) return current;
  // "0" solo se conserva como parte de un decimal.
  if (integer === "0") return key;

  return `${current}${key}`;
}

/** Agrupa los miles del monto tecleado para que se lea "74.878,64". */
function displayValue(raw: string): string {
  if (raw === "") return "0";

  const [integer, decimals] = raw.split(",");
  const grouped = new Intl.NumberFormat("es-VE").format(Number(integer || "0"));

  return decimals === undefined ? grouped : `${grouped},${decimals}`;
}

export function Calculator({ snapshot }: { snapshot: RatesSnapshot }) {
  const [raw, setRaw] = useState("100");
  const [elegida, setElegida] = useState<RateKey | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const router = useRouter();

  const guardada = useSyncExternalStore(suscribirMoneda, monedaGuardada, monedaEnServidor);
  const puedePegar = useSyncExternalStore(sinCambios, hayPortapapeles, noEnServidor);

  // La moneda origen se **deriva** en vez de guardarse tal cual, y de ahí salen
  // tres comportamientos con una sola expresión: manda lo que se toque en esta
  // sesión, si no la preferencia recordada, si no el arranque por defecto; y si
  // esa tasa está caída se cae a la primera con precio, para no quedar
  // apuntando a un botón deshabilitado.
  const candidata = elegida ?? guardada ?? "USD_BCV";
  const from =
    snapshot.rates[candidata].bsPerUnit !== null ? candidata : primeraDisponible(snapshot);

  const elegir = useCallback((key: RateKey) => {
    setElegida(key);
    guardarMoneda(key);
  }, []);

  const escribir = useCallback((key: KeypadKey) => {
    setRaw((current) => applyKey(current, key));
  }, []);

  const limpiar = useCallback(() => setRaw(""), []);

  const pegar = useCallback(async () => {
    try {
      const texto = await navigator.clipboard.readText();
      const monto = normalizarMontoPegado(texto, MAX_INTEGER_DIGITS, MAX_DECIMALS);
      // Sin monto reconocible no se toca lo que ya había: vaciar el display
      // por pegar una cadena cualquiera sería peor que no hacer nada.
      if (monto !== null) setRaw(monto);
    } catch {
      // El permiso de portapapeles se puede denegar en el momento; no hay nada
      // que reportar más allá de que no pasa nada.
    }
  }, []);

  // El teclado físico no hacía nada en escritorio, donde el teclado en pantalla
  // es lo único que había. No se toca el del sistema en el teléfono: allí no
  // hay eventos de teclado sin un campo enfocado.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;

      // Si el foco está en algo donde se escribe, manda ese campo.
      const activo = document.activeElement;
      if (
        activo instanceof HTMLInputElement ||
        activo instanceof HTMLTextAreaElement ||
        (activo instanceof HTMLElement && activo.isContentEditable)
      ) {
        return;
      }

      const { key } = evento;
      if (/^\d$/.test(key)) setRaw((actual) => applyKey(actual, key));
      else if (key === "," || key === ".") setRaw((actual) => applyKey(actual, ","));
      else if (key === "Backspace") setRaw((actual) => applyKey(actual, "back"));
      else if (key === "Escape") setRaw("");
      else return;

      evento.preventDefault();
    };

    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  const conversion = useMemo(
    () => convert(parseInput(raw), from, snapshot),
    [raw, from, snapshot],
  );

  const originRate = snapshot.rates[from];

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="monto-titulo" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="monto-titulo"
            className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]"
          >
            Monto en
          </h2>
          <button
            type="button"
            onClick={() => startRefresh(() => router.replace(`/?actualizar=${Date.now()}`))}
            disabled={isRefreshing}
            className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium text-[color:var(--muted)] transition active:scale-95 disabled:opacity-50"
          >
            {isRefreshing ? "Actualizando…" : "↻ Actualizar tasas"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {RATE_ORDER.map((key) => {
            const rate = snapshot.rates[key];
            const selected = key === from;

            return (
              <button
                key={key}
                type="button"
                onClick={() => elegir(key)}
                aria-pressed={selected}
                disabled={rate.bsPerUnit === null}
                className={`rounded-xl border px-2 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
                  selected
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                    : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)]"
                }`}
              >
                {rate.shortLabel}
              </button>
            );
          })}
        </div>

        <output
          aria-live="polite"
          className="tabular block truncate rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4 text-right text-4xl font-semibold sm:text-5xl"
        >
          <span className="mr-2 align-middle text-lg font-normal text-[color:var(--muted)]">
            {originRate.symbol}
          </span>
          {displayValue(raw)}
        </output>
      </section>

      {/* `min-w-0` en los hijos: una celda de grid no se encoge por debajo de
          su contenido salvo que se le diga, así que un monto largo en las
          equivalencias ensanchaba la columna y, con ella, la página entera —el
          teclado se estiraba detrás sin tener la culpa. */}
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        <Keypad onKey={escribir} onClear={limpiar} onPaste={puedePegar ? pegar : undefined} />
        <ConversionResults conversion={conversion} snapshot={snapshot} />
      </div>
    </div>
  );
}
