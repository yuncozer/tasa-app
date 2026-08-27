import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AlertaBrechaPanel } from "@/components/AlertaBrechaPanel";
import { construirAlertaBrecha } from "@/lib/alerta-brecha";
import { buildCaptionBrecha } from "@/lib/caption";
import { formatVariacion } from "@/lib/format";
import { getRates } from "@/lib/rates";

export const metadata: Metadata = {
  title: "Alerta de brecha — La Tasa",
};

/**
 * Página aparte y sin cron: la alerta de brecha sale cuando el admin ve que el
 * movimiento merece contarse, no dos veces al día. Igual que `/admin/semanal`,
 * la pieza se construye en el servidor y baja por props —pedirla desde el
 * cliente obligaría a un `setState` dentro de un efecto, el patrón que el
 * proyecto evita.
 */
export default async function AdminBrechaPage() {
  // `construirAlertaBrecha` ya degrada sola si Supabase falla: devuelve la
  // brecha de hoy sin comparación en vez de tumbar la página.
  const snapshot = await getRates();
  const alerta = await construirAlertaBrecha(snapshot);

  const flecha = alerta.direccion === "sube" ? "↑" : alerta.direccion === "baja" ? "↓" : "";
  const variacionTexto =
    alerta.direccion === "desconocida"
      ? null
      : alerta.direccion === "igual"
        ? "sin cambios en la semana"
        : `${flecha} ${formatVariacion(alerta.variacion, "puntos")} en la semana`;

  return (
    <>
      <AdminPageHeader
        titulo="Alerta de brecha"
        descripcion="Cuánto se paga de más fuera del BCV y cuánto se movió en una semana."
      />

      <AlertaBrechaPanel
        titular={alerta.titular}
        brechaTexto={alerta.brechaTexto}
        brechaAntesTexto={alerta.brechaAntesTexto}
        variacionTexto={variacionTexto}
        sinComparacion={alerta.direccion === "desconocida"}
        publicable={alerta.publicable}
        caption={buildCaptionBrecha(alerta)}
      />
    </>
  );
}
