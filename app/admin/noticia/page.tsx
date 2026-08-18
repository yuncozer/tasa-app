import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import type { ProgramadaVista } from "@/components/ColaProgramadas";
import { Logo } from "@/components/Logo";
import { PublicarPanel } from "@/components/PublicarPanel";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { iaDisponible } from "@/lib/ia";
import { listarProgramadas } from "@/lib/programadas";
import { resumenPublicacion } from "@/lib/publish-news";

export const metadata: Metadata = {
  title: "Publicar noticia — La Tasa",
};

/**
 * La cola se lee aquí, en el servidor, y baja por props: pedirla desde el
 * cliente obligaría a un `setState` dentro de un efecto, que es justo el
 * patrón que el proyecto evita.
 *
 * Si Supabase no está configurado se devuelve vacía en vez de tumbar la
 * página: programar es opcional, y sin esas variables todo lo demás de
 * `/admin/noticia` sigue funcionando igual.
 */
async function leerCola(): Promise<ProgramadaVista[]> {
  try {
    const programadas = await listarProgramadas();
    return programadas.map((p) => ({
      id: p.id,
      publicarEn: p.publicar_en,
      estado: p.estado,
      error: p.error,
      // El payload entero no baja al navegador: de él solo interesa con qué
      // nombre se reconoce la fila.
      resumen: resumenPublicacion(p.payload),
    }));
  } catch {
    return [];
  }
}

export default async function AdminNoticiaPage() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  const programadas = await leerCola();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            Publicar <span className="text-accent">noticia</span>
          </h1>
        </div>
        <AdminNav activa="noticia" />
      </header>

      {/* Si hay clave de OpenRouter se decide en el servidor y baja por props:
          `lib/ia.ts` corre solo ahí, y ninguna variable de entorno del modelo
          tiene por qué llegar al navegador. */}
      <PublicarPanel programadas={programadas} iaDisponible={iaDisponible()} />
    </main>
  );
}
