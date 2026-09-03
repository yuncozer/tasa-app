import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Admin — La Tasa",
};

/**
 * Login de `/admin`: un solo campo, sin JavaScript. El `<form>` postea
 * directo a `app/api/admin/login/route.ts`, que pone la cookie de sesión.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-center gap-3">
        <Logo className="h-8 w-8 shrink-0 text-accent" />
        <h1 className="text-2xl font-bold leading-none tracking-tight">
          La <span className="text-accent">Tasa</span>
        </h1>
      </header>

      <form
        method="POST"
        action="/api/admin/login"
        className="flex flex-col gap-4 rounded-2xl border border-border-soft bg-surface px-4 py-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            className="rounded-xl border border-border-soft bg-surface-strong px-4 py-3 text-lg text-foreground outline-none"
          />
        </div>

        {error && (
          <p className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
            {error === "limite"
              ? "Demasiados intentos. Esperá unos minutos antes de volver a probar."
              : "Contraseña incorrecta."}
          </p>
        )}

        <button
          type="submit"
          className="rounded-xl border border-accent bg-accent/15 px-4 py-3 text-base font-semibold text-accent transition active:scale-95"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
