"use client";

import { ClipboardPaste } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BotonActualizar } from "@/components/BotonActualizar";
import { ConversionResults } from "@/components/ConversionResults";
import { useTasasViejas } from "@/components/OfflineNotice";
import { registrarEvento } from "@/lib/analitica-cliente";
import { Keypad, type KeypadKey } from "@/components/Keypad";
import { convert } from "@/lib/convert";
import {
  MAX_DECIMALES,
  MAX_ENTEROS,
  MENSAJE_ERROR,
  aplicarTecla,
  evaluar,
  formatoCuenta,
  terminaEnOperador,
  tieneOperador,
} from "@/lib/expresion";
import { normalizarMontoPegado } from "@/lib/format";
// Las tres viven en `lib/portapapeles.ts` porque el botón "Pegar" de
// `/admin/noticia` necesita exactamente la misma comprobación.
import { hayPortapapeles, noEnServidor, sinCambios } from "@/lib/portapapeles";
import {
  guardarMoneda,
  monedaEnServidor,
  monedaGuardada,
  suscribirMoneda,
} from "@/lib/preferencia-moneda";
import { RATE_ORDER } from "@/lib/rates";
import type { RateKey, RatesSnapshot } from "@/lib/types";

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
 * Agrupa los miles del monto tecleado para que se lea "74.878,64".
 *
 * Solo para un monto suelto: conserva lo que el usuario va escribiendo, como
 * la coma que acaba de pulsar ("12,"), que un número ya evaluado perdería.
 */
function displayValue(raw: string): string {
  if (raw === "") return "0";

  const [integer, decimals] = raw.split(",");
  const grouped = new Intl.NumberFormat("es-VE").format(Number(integer || "0"));

  return decimals === undefined ? grouped : `${grouped},${decimals}`;
}

export function Calculator({ snapshot }: { snapshot: RatesSnapshot }) {
  const [raw, setRaw] = useState("100");
  const [elegida, setElegida] = useState<RateKey | null>(null);
  const viejas = useTasasViejas(snapshot.fetchedAt);

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
    setRaw((current) => aplicarTecla(current, key));
  }, []);

  const limpiar = useCallback(() => setRaw(""), []);

  const pegar = useCallback(async () => {
    try {
      const texto = await navigator.clipboard.readText();
      const monto = normalizarMontoPegado(texto, MAX_ENTEROS, MAX_DECIMALES);
      // Sin monto reconocible no se toca lo que ya había: vaciar el display
      // por pegar una cadena cualquiera sería peor que no hacer nada.
      if (monto !== null) {
        setRaw(monto);
        registrarEvento("pegar");
      }
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
      if (/^\d$/.test(key)) setRaw((actual) => aplicarTecla(actual, key));
      else if (key === "," || key === ".") setRaw((actual) => aplicarTecla(actual, ","));
      else if (key === "+") setRaw((actual) => aplicarTecla(actual, "+"));
      else if (key === "-") setRaw((actual) => aplicarTecla(actual, "−"));
      else if (key === "*" || key === "x" || key === "X") setRaw((actual) => aplicarTecla(actual, "×"));
      else if (key === "/") setRaw((actual) => aplicarTecla(actual, "÷"));
      else if (key === "Backspace") setRaw((actual) => aplicarTecla(actual, "back"));
      else if (key === "Escape") setRaw("");
      else return;

      evento.preventDefault();
    };

    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  // Lo que se convierte es el **resultado** de la cuenta, no lo tecleado: con un
  // solo monto es ese mismo monto, y con una suma es el total. Si la cuenta no
  // tiene resultado (dividir entre cero, un negativo) no se convierte nada: ver
  // más abajo, donde se avisa en lugar de mostrar ceros.
  const resultado = useMemo(() => evaluar(raw), [raw]);
  const hayOperacion = tieneOperador(raw);
  const monto = resultado.valor ?? 0;

  // Una conversión se anota cuando el usuario **deja de teclear**, no en cada
  // dígito: escribir "74878" son cinco cambios de estado y una sola cuenta que
  // el usuario quería hacer. El detalle es la moneda de origen —de conjunto
  // cerrado— y nunca el monto: lo que se teclea es asunto de quien lo teclea.
  // Si además hubo operadores se anota `operacion`, que dice si esas teclas se
  // usan; sin ese dato no hay forma de saber si la columna de operaciones
  // sirve o solo ocupa sitio.
  useEffect(() => {
    if (monto <= 0) return;
    const espera = setTimeout(() => {
      registrarEvento("conversion", from);
      if (hayOperacion) registrarEvento("operacion", from);
    }, 1500);
    return () => clearTimeout(espera);
  }, [monto, hayOperacion, from]);

  const conversion = useMemo(() => convert(monto, from, snapshot), [monto, from, snapshot]);

  const originRate = snapshot.rates[from];

  return (
    <div id="calculadora" className="flex scroll-mt-16 flex-col gap-5">
      <section aria-labelledby="monto-titulo" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="monto-titulo"
            className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]"
          >
            Monto en
          </h2>
          <BotonActualizar destacar={viejas} />
        </div>

        {/* Siempre a la vista: esconderlas tras un desplegable obligaba a un
            toque solo para descubrir que hay opciones. El espacio se gana por
            otro lado: chips más pequeños (`text-xs`) y con el ancho justo de su
            texto en vez de tres columnas iguales, que caben en dos filas en
            vez de tres. */}
        <div role="group" aria-label="Moneda del monto" className="flex flex-wrap gap-1.5">
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
                className={`whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition active:scale-95 disabled:opacity-40 ${
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

        {/* Con una cuenta, la cuenta va pequeña arriba y el resultado —lo que se
            convierte— grande abajo. Con un solo monto el visor es idéntico al de
            siempre. */}
        <div className="relative">
          {/* "Pegar" es un ícono dentro del visor y no una tecla: pegar un
              monto es algo que se hace antes de teclear, sobre el monto
              mismo, y como tecla ocupaba un sitio del teclado a la altura de
              las que sí se usan dígito a dígito. Solo se pinta donde el
              navegador deja leer el portapapeles: un botón que nunca funciona
              es peor que no tenerlo. Va **fuera** del `<output>`, que es una
              región que se anuncia al cambiar y no debe contener controles. */}
          {puedePegar && (
            <button
              type="button"
              onClick={pegar}
              aria-label="Pegar monto"
              className="absolute left-1.5 top-1.5 z-10 rounded-xl p-2.5 text-[color:var(--muted)] transition active:scale-95"
            >
              <ClipboardPaste aria-hidden="true" className="size-5" />
            </button>
          )}
          <output
            aria-live="polite"
            className={`tabular block rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] py-4 pr-4 text-right ${
              puedePegar ? "pl-14" : "pl-4"
            }`}
          >
            {hayOperacion && (
              <span className="mb-1 block break-words text-sm font-normal leading-snug text-[color:var(--muted)]">
                {formatoCuenta(raw)}
              </span>
            )}
            {resultado.error ? (
              <span className="block text-base font-semibold text-[color:var(--warning)]">
                {MENSAJE_ERROR[resultado.error]}
              </span>
            ) : (
              <span className="block truncate text-4xl font-semibold sm:text-5xl">
                <span className="mr-2 align-middle text-lg font-normal text-[color:var(--muted)]">
                  {originRate.symbol}
                </span>
                {hayOperacion
                  ? new Intl.NumberFormat("es-VE", { maximumFractionDigits: MAX_DECIMALES }).format(monto)
                  : displayValue(raw)}
              </span>
            )}
          </output>
        </div>
      </section>

      {/* `min-w-0` en los hijos: una celda de grid no se encoge por debajo de
          su contenido salvo que se le diga, así que un monto largo en las
          equivalencias ensanchaba la columna y, con ella, la página entera —el
          teclado se estiraba detrás sin tener la culpa. */}
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        <Keypad
          onKey={escribir}
          onClear={limpiar}
          operadorPendiente={terminaEnOperador(raw) ? raw[raw.length - 1] : null}
        />
        {resultado.error ? (
          // Sin resultado no hay equivalencias que enseñar, y mostrarlas en cero
          // diría que el monto vale cero. Se explica qué hacer en su lugar.
          <section
            aria-label="Equivalencias"
            className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm"
          >
            <p className="font-medium text-warning">{MENSAJE_ERROR[resultado.error]}</p>
            <p className="mt-1 text-xs text-muted">
              Corrige la cuenta con la tecla de borrar para ver las equivalencias.
            </p>
          </section>
        ) : (
          <ConversionResults conversion={conversion} snapshot={snapshot} />
        )}
      </div>
    </div>
  );
}
