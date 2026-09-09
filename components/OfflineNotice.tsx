"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";
import { formatRelative } from "@/lib/format";

/**
 * Franja que avisa cuando lo que hay en pantalla **puede no ser de ahora**.
 *
 * Cubre dos casos que se ven igual desde el asiento del usuario y que antes se
 * trataban distinto:
 *
 * - **Sin conexión.** El service worker devuelve la última página guardada.
 * - **Con conexión, pero con datos viejos.** Pasa de dos maneras: con señal
 *   débil el service worker sirve la copia guardada tras agotar su margen de
 *   espera (`ESPERA_RED_MS` en `public/sw.js`), y una pestaña que lleva horas
 *   abierta nunca vuelve a pedir tasas porque la página se renderiza en el
 *   servidor y no se refresca sola.
 *
 * El segundo caso era un hueco y **no uno cosmético**: las tarjetas dicen su
 * antigüedad ("BCV · hace 5 horas") desde un componente de servidor, o sea que
 * ese texto se calcula al renderizar y queda **congelado** en el HTML. Una
 * copia guardada a las 6 de la tarde sigue diciendo "hace un momento" a
 * medianoche. Mientras el aviso dependía de `navigator.onLine` no salía ahí, y
 * enseñar una tasa vieja como si fuera fresca es el único daño real que esta
 * app puede causar.
 *
 * Por eso lo que se mira ahora es el reloj y no la conexión: si el snapshot
 * pasa de `VEJEZ_MS`, se avisa aunque haya cobertura. La franja sigue diciendo
 * de cuándo son los datos, que es la única cifra que importa aquí.
 */

/**
 * A partir de cuándo las tasas dejan de poder pasar por actuales. Tres veces el
 * TTL de la caché en memoria (`lib/cache.ts`, 5 minutos), que es cada cuánto se
 * refrescan de verdad: por debajo de eso la franja saldría en aperturas
 * normales y el ámbar dejaría de significar algo.
 */
const VEJEZ_MS = 15 * 60_000;

/**
 * Cada cuánto se vuelve a mirar el reloj. No hace falta más fino: lo que se
 * decide es si algo pasó de quince minutos.
 */
const LATIDO_MS = 30_000;

function suscribir(alCambiar: () => void) {
  window.addEventListener("online", alCambiar);
  window.addEventListener("offline", alCambiar);

  return () => {
    window.removeEventListener("online", alCambiar);
    window.removeEventListener("offline", alCambiar);
  };
}

const estadoActual = () => !navigator.onLine;

/** En el servidor se asume conexión: así el HTML coincide con el primer pintado. */
const estadoEnServidor = () => false;

/**
 * El reloj, como estado externo a React.
 *
 * No se puede leer `Date.now()` dentro del render: `getSnapshot` tiene que
 * devolver el mismo valor mientras nada cambie, o React vuelve a renderizar sin
 * fin. Así que el instante se guarda aquí y solo se mueve con el latido.
 *
 * En el servidor vale `0`, que el componente lee como "todavía no se sabe" y no
 * como "recién capturado". Eso es lo que evita el desajuste de hidratación en
 * el caso que más importa: una página servida de la caché horas después: su
 * HTML no trae franja, y si el primer render del cliente la pintara, React
 * protestaría. Sale en el render siguiente, ya suscrito.
 */
let instante = 0;
const oyentes = new Set<() => void>();
let latido: ReturnType<typeof setInterval> | undefined;

function suscribirReloj(alCambiar: () => void) {
  oyentes.add(alCambiar);

  if (latido === undefined) {
    instante = Date.now();
    latido = setInterval(() => {
      instante = Date.now();
      for (const oyente of oyentes) oyente();
    }, LATIDO_MS);
  }

  return () => {
    oyentes.delete(alCambiar);
    if (oyentes.size === 0) {
      clearInterval(latido);
      latido = undefined;
    }
  };
}

const relojActual = () => instante;
const relojEnServidor = () => 0;

export function OfflineNotice({ fetchedAt }: { fetchedAt: string }) {
  const sinConexion = useSyncExternalStore(suscribir, estadoActual, estadoEnServidor);
  const ahora = useSyncExternalStore(suscribirReloj, relojActual, relojEnServidor);

  // El evento se anota **al volver la conexión**, no al perderla: sin red no
  // hay forma de mandarlo y la analítica no guarda cola en el dispositivo (ver
  // `lib/analitica-cliente.ts`). Lo que se mide es "esta sesión llegó a usar la
  // app sin señal", que es la pregunta que justifica el service worker. Sigue
  // atado a la conexión y no a la vejez: son cosas distintas.
  const estuvoSinConexion = useRef(false);
  useEffect(() => {
    if (sinConexion) {
      estuvoSinConexion.current = true;
      return;
    }
    if (estuvoSinConexion.current) {
      estuvoSinConexion.current = false;
      registrarEvento("sin_conexion");
    }
  }, [sinConexion]);

  // `ahora === 0` es el servidor y el primer render del cliente: ahí no se
  // opina sobre la edad de nada.
  const viejas = ahora > 0 && ahora - Date.parse(fetchedAt) > VEJEZ_MS;

  if (!sinConexion && !viejas) return null;

  // Se ancla al área segura y no al borde: instalada en iPhone, el borde queda
  // bajo la barra de estado.
  return (
    <div
      role="status"
      className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 mb-1 border-b border-[color:var(--warning)]/40 bg-[color:var(--warning)]/15 px-4 py-2 text-center text-xs font-medium text-[color:var(--warning)] backdrop-blur sm:-mx-6 sm:px-6"
    >
      {sinConexion ? (
        <>Sin conexión · tasas de {formatRelative(fetchedAt)}</>
      ) : (
        <>Tasas de {formatRelative(fetchedAt)} · pulsa &ldquo;Actualizar tasas&rdquo;</>
      )}
    </div>
  );
}
