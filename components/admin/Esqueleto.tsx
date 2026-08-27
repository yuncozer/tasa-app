/**
 * Las piezas de esqueleto que se muestran mientras el servidor resuelve una
 * lectura.
 *
 * `Bloque` vivía suelto dentro de `app/admin/(dashboard)/loading.tsx`; se
 * sacó aquí cuando la página de analíticas necesitó el suyo propio, para que
 * el pulso, el radio y el color de relleno sean los mismos en los dos sitios
 * — un esqueleto que no se parece al de al lado se lee como un error de
 * pintado, no como una espera.
 */
export function Bloque({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-strong ${className ?? ""}`} />;
}

/**
 * El esqueleto de un bloque de analíticas: la fila de tarjetas, el gráfico y
 * las dos listas, en las mismas proporciones que el contenido real.
 *
 * Aquí sí imita la página —al contrario que el esqueleto genérico de
 * `/admin`, que cubre siete formularios distintos— porque esta pantalla
 * siempre tiene la misma forma: cuatro cifras arriba, una serie en medio y
 * listas debajo. Cuando el esqueleto coincide con lo que llega, el contenido
 * no salta al aparecer, que es la mitad del motivo de poner uno.
 *
 * Con una excepción asumida: la pestaña de Enlaces tiene cinco tarjetas en
 * vez de cuatro, y aquí se dibujan cuatro. Una tarjeta de diferencia durante
 * la espera no se nota; un esqueleto por pestaña sí habría que mantenerlo
 * sincronizado con las tres.
 */
export function EsqueletoAnaliticas() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando analíticas…</span>

      <Bloque className="h-4 w-40" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bloque key={i} className="h-24 w-full" />
        ))}
      </div>

      <Bloque className="h-44 w-full" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Bloque className="h-56 w-full" />
        <Bloque className="h-56 w-full" />
      </div>
    </div>
  );
}
