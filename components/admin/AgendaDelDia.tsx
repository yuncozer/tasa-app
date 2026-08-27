import { AlertTriangle, Check, Clock, HelpCircle } from "lucide-react";
import Link from "next/link";
import type { AgendaHoy, EstadoTarea } from "@/lib/agenda-hoy";
import { formatFecha } from "@/lib/format";

/**
 * La agenda del día en `/admin`: qué salió, qué está en camino y qué necesita
 * una persona.
 *
 * Va **arriba del todo**, antes de las secciones, porque responde la pregunta
 * con la que se abre el panel — "¿está todo bien?"— y las secciones responden
 * la siguiente: "¿dónde lo arreglo?". Cada fila enlaza a donde se resuelve,
 * así que leerla y actuar es el mismo gesto.
 *
 * El color va por estado y no por decoración, igual que en el resto del
 * proyecto: ámbar solo cuando algo pide una persona ahora mismo (`--warning`
 * es semántico), acento para lo que ya salió, y gris para lo que está
 * esperando su hora. Un post que todavía no toca **no es un problema**, y
 * pintarlo de ámbar media jornada vaciaría de significado al ámbar.
 */

const ICONO: Record<EstadoTarea, typeof Check> = {
  hecho: Check,
  pendiente: AlertTriangle,
  esperando: Clock,
  problema: AlertTriangle,
  sin_dato: HelpCircle,
};

const TONO: Record<EstadoTarea, string> = {
  hecho: "border-accent/40 bg-accent/10 text-accent",
  pendiente: "border-warning/40 bg-warning/10 text-warning",
  esperando: "border-border-soft bg-surface-strong text-muted",
  problema: "border-warning/40 bg-warning/10 text-warning",
  sin_dato: "border-border-soft bg-surface-strong text-muted",
};

export function AgendaDelDia({ agenda }: { agenda: AgendaHoy }) {
  return (
    <section aria-labelledby="agenda-hoy" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="agenda-hoy" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Hoy
        </h2>
        <p className="text-xs text-muted">
          {formatFecha(agenda.fecha)}
          {agenda.porAtender > 0
            ? ` · ${agenda.porAtender} por atender`
            : " · todo en orden"}
        </p>
      </div>

      <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface">
        {agenda.tareas.map((tarea) => {
          const Icono = ICONO[tarea.estado];
          const fila = (
            <>
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-xl border ${TONO[tarea.estado]}`}
              >
                <Icono aria-hidden="true" className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{tarea.titulo}</span>
                <span className="text-xs text-muted">{tarea.detalle}</span>
              </span>
            </>
          );

          return (
            <li key={tarea.id}>
              {tarea.href ? (
                <Link
                  href={tarea.href}
                  className="flex items-center gap-3 px-4 py-3 transition active:scale-[0.99]"
                >
                  {fila}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">{fila}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
