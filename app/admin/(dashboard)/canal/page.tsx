import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BotonCopiarTexto } from "@/components/BotonCopiarTexto";
import { formatMensajeCanal } from "@/lib/canal-whatsapp";
import { formatRelative } from "@/lib/format";
import { listarMediaSemana, type MediaReciente } from "@/lib/instagram";

export const metadata: Metadata = {
  title: "Enviar al canal — La Tasa",
};

function primeraLinea(caption: string | null): string {
  const linea = caption?.split("\n").find((l) => l.trim().length > 0);
  return linea ?? "(sin caption)";
}

/**
 * `null` distingue "Instagram no respondió" de "no hay posts esta semana":
 * la primera es un error a mostrar, la segunda es un estado normal un lunes
 * temprano.
 */
async function leerPosts(): Promise<MediaReciente[] | null> {
  try {
    return await listarMediaSemana();
  } catch {
    return null;
  }
}

/**
 * Sin API gratuita de Meta para publicar en un Canal de WhatsApp, el envío es
 * manual: esta página arma el mensaje y el admin lo copia y lo pega él mismo
 * en el canal. La lista de posts sale directo de la Graph API
 * (`listarMediaSemana`), no de una tabla propia — ver `lib/instagram.ts`.
 *
 * La selección viaja en `searchParams` y no en estado de cliente, mismo
 * criterio que el resto de `/admin`: lo que puede resolver el servidor no
 * necesita un `setState` en un efecto.
 */
export default async function AdminCanalPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string }>;
}) {
  const { post } = await searchParams;
  const posts = await leerPosts();
  const seleccionado = posts?.find((item) => item.id === post) ?? null;

  return (
    <>
      <AdminPageHeader
        titulo="Enviar al canal"
        descripcion="Arma el mensaje de WhatsApp a partir de un post ya publicado."
      />

      {posts === null && (
        <p className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
          No se pudo consultar los posts recientes de Instagram.
        </p>
      )}

      {posts !== null && posts.length === 0 && (
        <p className="text-sm text-muted">No hay posts publicados en los últimos 7 días.</p>
      )}

      {seleccionado && (
        <div className="flex flex-col gap-3">
          <Link href="/admin/canal" className="text-xs font-medium text-muted underline">
            ← Elegir otro post
          </Link>
          <BotonCopiarTexto
            textoInicial={formatMensajeCanal({
              caption: seleccionado.caption,
              permalinkPost: seleccionado.permalink,
            })}
          />
        </div>
      )}

      {!seleccionado && posts !== null && posts.length > 0 && (
        <div className="flex flex-col gap-2">
          {posts.map((item) => (
            <Link
              key={item.id}
              href={`/admin/canal?post=${item.id}`}
              className="flex flex-col gap-1 rounded-2xl border border-border-soft bg-surface px-4 py-3 transition active:scale-[0.98]"
            >
              <p className="text-xs font-medium text-muted">{formatRelative(item.timestamp)}</p>
              <p className="truncate text-sm">{primeraLinea(item.caption)}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
