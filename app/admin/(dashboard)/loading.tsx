/**
 * Se muestra mientras Next.js resuelve el `page.tsx` de destino — cualquier
 * sub-ruta de `/admin`, porque `loading.tsx` envuelve tanto este segmento
 * como todos los suyos. Antes, cambiar de sección se sentía colgado durante
 * lo que tardaba el servidor en leer Supabase o las tasas en vivo: no había
 * nada en pantalla hasta que la respuesta completa estaba lista.
 *
 * Vive dentro de `AdminShell` (el layout la envuelve, no al revés), así que
 * la sidebar y la nav de móvil no parpadean al navegar — solo el área de
 * contenido se cambia por este esqueleto genérico. No intenta imitar cada
 * página: un esqueleto por sección habría que mantenerlo sincronizado con
 * cada formulario, y esto ya cubre lo que de verdad importa — que algo se
 * mueva de inmediato. La excepción es `/admin/analiticas`, que sí tiene el
 * suyo (`EsqueletoAnaliticas`): esa pantalla tiene siempre la misma forma y
 * se puede imitar sin mantener nada sincronizado.
 */
import { Bloque } from "@/components/admin/Esqueleto";

export default function CargandoSeccion() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2">
        <Bloque className="h-7 w-48" />
        <Bloque className="h-4 w-72 max-w-full" />
      </div>
      <Bloque className="h-32 w-full" />
      <Bloque className="h-11 w-40" />
    </div>
  );
}
