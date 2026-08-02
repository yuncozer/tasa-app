import { formatDate } from "@/lib/format";

/**
 * Letra pequeña de la app: cuándo se consultaron las tasas y el aviso legal.
 *
 * El descargo deja constancia de tres cosas: los datos son de terceros, Tasapp no
 * fija ni certifica ninguna tasa, y verificar antes de operar es del usuario.
 */
export function Footer({ fetchedAt }: { fetchedAt: string }) {
  return (
    <footer className="mt-2 flex flex-col gap-3 border-t border-[color:var(--border)] pt-4 text-xs leading-relaxed text-[color:var(--muted)]">
      <p className="text-center">
        Tasas consultadas el {formatDate(fetchedAt)} · se actualizan cada 5 minutos
      </p>

      <p>
        <strong className="font-semibold text-[color:var(--foreground)]">Aviso:</strong> Tasapp
        muestra tasas obtenidas de fuentes públicas de terceros (BCV, Binance P2P y
        ExchangeRate-API) con fines exclusivamente informativos. No fijamos, certificamos ni
        garantizamos ninguna tasa de cambio, no intervenimos en operaciones de compra o venta
        de divisas y nada de lo aquí mostrado constituye asesoría financiera. Los datos pueden
        estar desactualizados o contener errores: confirma siempre con la fuente oficial antes
        de cerrar cualquier operación.
      </p>
    </footer>
  );
}
