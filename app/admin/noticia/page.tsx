import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PublicarNoticiaForm } from "@/components/PublicarNoticiaForm";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";

export const metadata: Metadata = {
  title: "Publicar noticia — La Tasa",
};

export default async function AdminNoticiaPage() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            Publicar <span className="text-accent">noticia</span>
          </h1>
        </div>
        <form method="POST" action="/api/admin/logout">
          <button
            type="submit"
            className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <PublicarNoticiaForm />
    </main>
  );
}
