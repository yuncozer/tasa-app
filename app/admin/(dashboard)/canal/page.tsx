import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PendienteAlNavegar } from "@/components/admin/PendienteAlNavegar";
import { Spinner } from "@/components/admin/Spinner";
import { BotonCopiarTexto } from "@/components/BotonCopiarTexto";
import { enlaceWhatsapp } from "@/lib/atajos";
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
 * El mensaje listo para copiar.
 *
 * Vive en su propio componente para poder colgarlo de un `<Suspense>`: armarlo
 * dejó de ser dar formato a un texto. Desde que el enlace del canal pasa por un
 * atajo propio, aquí se crea el slug del post y, la primera vez, se copia su
 * miniatura a Cloudinary — uno o dos segundos en los que la pantalla no decía
 * nada. Es idempotente: volver a abrir el mismo post reutiliza slug e imagen.
 */
async function MensajeParaCanal({ post }: { post: MediaReciente }) {
  const mensaje = await formatMensajeCanal({
    caption: post.caption,
    permalinkPost: post.permalink,
    imagenUrl: post.imagenUrl,
  });

  return <BotonCopiarTexto textoInicial={mensaje} enlaceCanal={enlaceWhatsapp()} />;
}

/**
 * Lo que se ve mientras tanto. Dice **qué** está pasando y no solo que hay que
 * esperar: la primera vez que se abre un post hay una subida de por medio, y un
 * bloque gris sin explicación se lee como que algo se colgó.
 */
function EsqueletoMensaje() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-4">
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="size-4" />
        Preparando el enlace del post…
      </p>
      <div className="h-3 w-4/5 animate-pulse rounded bg-surface-strong" />
      <div className="h-3 w-3/5 animate-pulse rounded bg-surface-strong" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-surface-strong" />
    </div>
  );
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
          {/* La `key` es lo que lo hace suspender de nuevo al cambiar de post:
              sin ella React reutilizaría el subárbol y dejaría en pantalla el
              mensaje del anterior mientras se arma el nuevo — mismo motivo que
              en `/admin/analiticas`. */}
          <Suspense key={seleccionado.id} fallback={<EsqueletoMensaje />}>
            <MensajeParaCanal post={seleccionado} />
          </Suspense>
        </div>
      )}

      {!seleccionado && posts !== null && posts.length > 0 && (
        <div className="flex flex-col gap-2">
          {posts.map((item) => (
            <Link
              key={item.id}
              href={`/admin/canal?post=${item.id}`}
              // Sin prefetch a propósito, y es una precaución, no una
              // corrección de algo observado: abrir este enlace **tiene
              // efectos** —crea el slug del post y, la primera vez, sube su
              // miniatura a Cloudinary—, y en producción Next prefetchea los
              // enlaces al entrar en pantalla. Sin esto, abrir la lista podría
              // preparar los veintitantos posts de la semana en vez de el que
              // se elige. No se pudo comprobar en desarrollo porque ahí no hay
              // prefetch; se deja puesto porque un destino con efectos no debe
              // dispararse por mirarlo.
              prefetch={false}
              className="flex flex-col gap-1 rounded-2xl border border-border-soft bg-surface px-4 py-3 transition active:scale-[0.98]"
            >
              <p className="text-xs font-medium text-muted">{formatRelative(item.timestamp)}</p>
              <p className="truncate text-sm">{primeraLinea(item.caption)}</p>
              {/* Tiene que ir dentro del `<Link>`: `useLinkStatus` lee el
                  estado del enlace que lo envuelve, así que en una lista se
                  ilumina el que se tocó y no todos. */}
              <PendienteAlNavegar />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
