import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SelloDeHora } from "@/components/admin/SelloDeHora";
import { ParadaPanel } from "@/components/ParadaPanel";
import { leerParadaPendiente } from "@/lib/parada";

export const metadata: Metadata = {
  title: "Dólar en La Parada — La Tasa",
};

/**
 * Borrador del post "Dólar en La Parada" que detectó
 * `app/api/cron/vigilar-parada/route.ts`, listo para revisar y publicar con
 * un toque. No tiene formulario de URL como `/admin/noticia`: la fuente es
 * siempre la misma columna de lanacionweb.com.
 *
 * La imagen la sirve `/api/og/instagram-post-parada`, una plantilla propia
 * (no el marco genérico de noticia) que lee el borrador directo de
 * Supabase — no hace falta pasarle nada por props aquí, el `<img>` del panel
 * apunta a esa ruta y ella misma resuelve el estado actual.
 */
export default async function AdminParadaPage() {
  const pendiente = await leerParadaPendiente().catch(() => null);
  const borrador = pendiente && !pendiente.publicado ? pendiente : null;

  // Se fecha por cuándo se **detectó** el artículo, no por cuándo se abrió la
  // pantalla: la antigüedad del borrador es lo que dice si sigue siendo la
  // columna de hoy o si quedó una de ayer sin publicar.
  const sello = borrador ? <SelloDeHora iso={borrador.detectadoEn} que="Borrador" /> : undefined;

  return (
    <>
      <AdminPageHeader
        titulo="Dólar en La Parada"
        descripcion="Revisa y publica el borrador que detecta el cron de lanacionweb.com."
        aviso={sello}
      />

      <ParadaPanel borrador={borrador} />
    </>
  );
}
