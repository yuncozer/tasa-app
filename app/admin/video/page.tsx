import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/AdminNav";
import { BotonCopiarTexto } from "@/components/BotonCopiarTexto";
import { GeneradorVideoTasas } from "@/components/GeneradorVideoTasas";
import { Logo } from "@/components/Logo";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
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
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  const resumen = await leerResumen();
  // Con la nube configurada no hace falta nada local, así que no se
  // comprueba el CLI ni ffmpeg: preguntarlo daría un aviso falso en Vercel.
  const enNube = nubeConfigurada();
  const motivo = enNube ? null : motivoNoDisponible();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            La <span className="text-accent">Tasa</span>
          </h1>
        </div>
        <AdminNav activa="video" />
      </header>

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
    </main>
  );
}
