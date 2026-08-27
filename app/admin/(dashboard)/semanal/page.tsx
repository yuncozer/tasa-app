import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SelloDeHora } from "@/components/admin/SelloDeHora";
import { ReporteSemanalPanel } from "@/components/ReporteSemanalPanel";
import { buildCaptionSemanal } from "@/lib/caption";
import { iaDisponible } from "@/lib/ia";
import { getRates } from "@/lib/rates";
import { construirReporteSemanal } from "@/lib/semanal";

export const metadata: Metadata = {
  title: "Reporte semanal — La Tasa",
};

/**
 * Página aparte de `/admin/noticia` y no una pestaña suya: aquella es un
 * formulario con estado propio (switch Post/Reel, subidas, vista previa
 * desactualizada, cola de programadas) y este reporte **no tiene entradas** —se
 * mira y se publica—. Meterlo dentro obligaría a un tercer destino en
 * `PublicarPanel` que no comparte ni un campo con los otros dos.
 *
 * El reporte se construye en el servidor y baja por props, por la misma razón
 * que la cola de `/admin/noticia`: pedirlo desde el cliente obligaría a un
 * `setState` dentro de un efecto, el patrón que el proyecto evita.
 */
export default async function AdminSemanalPage() {
  // `construirReporteSemanal` ya degrada sola si Supabase falla: devuelve el
  // reporte sin variaciones en vez de tumbar la página.
  const snapshot = await getRates();
  const reporte = await construirReporteSemanal(snapshot);

  return (
    <>
      <AdminPageHeader
        titulo="Reporte semanal"
        descripcion="Cómo se movieron las tasas en los últimos 7 días."
        aviso={<SelloDeHora iso={snapshot.fetchedAt} que="Tasas" />}
      />

      <ReporteSemanalPanel
        rangoTexto={reporte.rangoTexto}
        sinComparacion={reporte.sinComparacion}
        caption={buildCaptionSemanal(reporte)}
        iaDisponible={iaDisponible()}
      />
    </>
  );
}
