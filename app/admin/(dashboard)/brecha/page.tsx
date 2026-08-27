import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SelloDeHora } from "@/components/admin/SelloDeHora";
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
  // Las dos variantes se arman en el servidor y bajan juntas: el toggle solo
  // cambia cuál se enseña, sin pedirle nada a la red. La segunda no vuelve a
  // consultar el histórico —`comparar: false` ni lo mira— así que no cuesta
  // una lectura más a Supabase, y el snapshot es el mismo objeto.
  const alerta = await construirAlertaBrecha(snapshot);
  const alertaSimple = await construirAlertaBrecha(snapshot, { comparar: false });

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
        aviso={<SelloDeHora iso={snapshot.fetchedAt} que="Tasas" />}
      />

      <AlertaBrechaPanel
        titular={alerta.titular}
        brechaTexto={alerta.brechaTexto}
        brechaAntesTexto={alerta.brechaAntesTexto}
        variacionTexto={variacionTexto}
        sinComparacion={alerta.direccion === "desconocida"}
        publicable={alerta.publicable}
        caption={buildCaptionBrecha(alerta)}
        captionSimple={buildCaptionBrecha(alertaSimple)}
        titularSimple={alertaSimple.titular}
      />
    </>
  );
}
