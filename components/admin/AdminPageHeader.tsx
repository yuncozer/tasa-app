import type { ReactNode } from "react";

/**
 * Cabecera estándar de cada sub-página de `/admin`. Antes cada página traía
 * su propio `<header>` con logo + título + nav repetidos; con `AdminShell`
 * ya puestos, lo único que varía de una página a otra es el título, la
 * descripción y, a veces, un aviso de estado — así que es lo único que
 * queda aquí.
 */
export function AdminPageHeader({
  titulo,
  descripcion,
  aviso,
}: {
  titulo: string;
  descripcion?: string;
  /** Franja de estado opcional, p. ej. "Hay proveedores degradados ahora mismo". */
  aviso?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold leading-none tracking-tight sm:text-2xl">{titulo}</h1>
        {descripcion && <p className="text-sm text-muted">{descripcion}</p>}
      </div>
      {aviso}
    </header>
  );
}
