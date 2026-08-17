import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { BotonCopiarTexto } from "@/components/BotonCopiarTexto";
import { Logo } from "@/components/Logo";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
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
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  const { post } = await searchParams;
  const posts = await leerPosts();
  const seleccionado = posts?.find((item) => item.id === post) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            Enviar al <span className="text-accent">canal</span>
          </h1>
        </div>
        <AdminNav activa="canal" />
      </header>

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
    </main>
  );
}
