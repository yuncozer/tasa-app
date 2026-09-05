"use client";

import { Bell, BellRing } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";
import {
  activarAvisos,
  desactivarAvisos,
  hayAvisos,
  noEnServidor,
  sinCambios,
  suscripcionActual,
} from "@/lib/avisos";

/**
 * Interruptor de los avisos "ya están las tasas de hoy".
 *
 * Hasta ahora la app no podía llamar al usuario: todo el retorno dependía de
 * que abriera el icono o viera Instagram. Esto es lo que construye el hábito —
 * dos avisos al día, con las cifras dentro, cuando el cron publica.
 *
 * **No hay umbral ni configuración**, y es deliberado: el mismo aviso para
 * todos significa que no hay nada que guardar por persona más allá de la
 * suscripción del dispositivo, que es lo mínimo físicamente necesario para
 * poder entregar algo (ver la migración `0021`).
 *
 * **No se pinta donde el navegador no puede recibirlos** — que en iPhone es
 * cualquier pestaña de Safari, porque ahí iOS solo lo permite con la app
 * instalada. Mismo criterio que el botón "Pegar": uno que nunca funciona es
 * peor que ninguno. Y esa condición no se detecta por sistema operativo sino
 * preguntando por `PushManager`, que es lo que de verdad decide.
 */
export function AvisoTasas() {
  const disponible = useSyncExternalStore(sinCambios, hayAvisos, noEnServidor);
  const [activo, setActivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Aquí sí hace falta un efecto, al contrario que el resto del proyecto: si
  // este dispositivo ya está suscrito no lo dice `navigator` de forma síncrona,
  // hay que preguntárselo al service worker y eso es una promesa. `useSyncExternalStore`
  // no sirve para algo que se resuelve después.
  useEffect(() => {
    let vivo = true;
    void suscripcionActual().then((s) => {
      if (vivo) setActivo(s !== null);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!disponible) return null;

  const alternar = async () => {
    setOcupado(true);
    const logrado = activo ? await desactivarAvisos() : await activarAvisos();

    if (logrado) {
      setActivo(!activo);
      // El detalle distingue las altas de las bajas, que es lo único que hace
      // falta saber. No se anota nada del dispositivo: la analítica sigue sin
      // poder cruzarse con quién está suscrito.
      registrarEvento("avisos", activo ? "baja" : "alta");
    }

    setOcupado(false);
  };

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={ocupado}
      aria-pressed={activo}
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${
        activo
          ? "border-accent bg-accent/15 text-accent"
          : "border-border-soft bg-surface text-muted"
      }`}
    >
      {activo ? (
        <BellRing aria-hidden="true" className="size-[18px]" />
      ) : (
        <Bell aria-hidden="true" className="size-[18px]" />
      )}
      {activo ? "Avisos activados" : "Avísame de las tasas"}
    </button>
  );
}
