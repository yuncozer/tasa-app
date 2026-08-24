import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { ProgramadaVista } from "@/components/ColaProgramadas";
import { PublicarPanel } from "@/components/PublicarPanel";
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
  const programadas = await leerCola();

  return (
    <>
      <AdminPageHeader
        titulo="Publicar noticia"
        descripcion="Artículo externo o contenido propio, en post, carrusel o Reel."
      />

      {/* Si hay clave de OpenRouter se decide en el servidor y baja por props:
          `lib/ia.ts` corre solo ahí, y ninguna variable de entorno del modelo
          tiene por qué llegar al navegador. */}
      <PublicarPanel programadas={programadas} iaDisponible={iaDisponible()} />
    </>
  );
}
