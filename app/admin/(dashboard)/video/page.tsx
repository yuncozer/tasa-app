import type { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BotonCopiarTexto } from "@/components/BotonCopiarTexto";
import { GeneradorVideoTasas } from "@/components/GeneradorVideoTasas";
import { formatRelative } from "@/lib/format";
import { nubeConfigurada } from "@/lib/video-nube";
import { motivoNoDisponible, resumenTasas, type ResumenTasas } from "@/lib/video-tasas";

export const metadata: Metadata = {
  title: "Generador de videos — La Tasa",
};

/**
 * Generador de videos: de momento, una sola sección — el resumen de tasas.
 *
 * Enseña el copy del último post de tasas y, al lado, el botón que arma el Reel
 * con esas mismas cifras. El copy se **reconstruye** con `buildCaption()` sobre
 * el snapshot congelado en vez de pedírselo a la Graph API: es la misma función
 * y el mismo snapshot que usó el cron, así que sale idéntico, y esta pantalla no
 * depende de que Instagram responda para enseñar lo que ya se publicó.
 *
 * El resumen lo lee **la página en el servidor** y baja por props, igual que la
 * cola de programadas: pedirlo desde el cliente obligaría a un `setState` dentro
 * de un efecto, que es el patrón que este proyecto evita.
 */

/** `null` distingue "Supabase no respondió" de "no hay snapshot todavía". */
async function leerResumen(): Promise<ResumenTasas | null> {
  try {
    return await resumenTasas();
  } catch {
    return null;
  }
}

export default async function AdminVideoPage() {
  const resumen = await leerResumen();
  // Con la nube configurada no hace falta nada local, así que no se
  // comprueba el CLI ni ffmpeg: preguntarlo daría un aviso falso en Vercel.
  const enNube = nubeConfigurada();
  const motivo = enNube ? null : motivoNoDisponible();

  return (
    <>
      <AdminPageHeader
        titulo="Generador de videos"
        descripcion="El Reel de tasas del día, con el copy del último post."
      />

      <section className="flex flex-col gap-4 rounded-2xl border border-border-soft bg-surface px-4 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Resumen de tasas</h2>
          {resumen ? (
            <p className="text-sm text-muted">
              Último post de tasas · {resumen.momento === "manana" ? "mañana" : "tarde"}, {resumen.hora} ·{" "}
              {formatRelative(resumen.capturadoEn)}
            </p>
          ) : (
            <p className="text-sm text-warning">
              No se pudo leer el snapshot del último post. Comprueba las credenciales de Supabase y
              recarga.
            </p>
          )}
        </div>

        {resumen ? (
          <>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted">Copy publicado</h3>
              <BotonCopiarTexto textoInicial={resumen.caption} />
            </div>

            <div className="flex flex-col gap-2 border-t border-border-soft pt-4">
              <h3 className="text-sm font-semibold text-muted">Video</h3>
              <p className="text-sm text-muted">
                Reel vertical de 10 s con estas mismas cifras y la brecha de remate. Lleva efectos de
                sonido; la voz se añade después.
              </p>
              <GeneradorVideoTasas motivoNoDisponible={motivo} enNube={enNube} />
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
