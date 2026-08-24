import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { Logo } from "@/components/Logo";
import { PublicarHoyPanel } from "@/components/PublicarHoyPanel";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { formatClock, formatRate } from "@/lib/format";
import { getRates, RATE_ORDER } from "@/lib/rates";

export const metadata: Metadata = {
  title: "Publicar tasas — La Tasa",
};

/**
 * Botón para disparar el carrusel diario de tasas fuera de las 9:00 am y las
 * 6:00 pm fijas del cron — por ejemplo, cuando el BCV falló en el disparo
 * automático y ya respondió al reintentar a mano. No tiene entradas, como
 * `/admin/semanal`: se mira lo que hay ahora mismo y se publica.
 *
 * Muestra las tasas **en vivo** (`getRates()`), no el snapshot congelado que
 * sirven las imágenes del último post: el admin necesita ver el dato de
 * ahora para decidir si vale la pena disparar, y ese snapshot solo se
 * actualiza al publicar.
 */
export default async function AdminHoyPage() {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  const snapshot = await getRates();
  const filas = RATE_ORDER.filter((key) => key !== "VES").map((key) => {
    const rate = snapshot.rates[key];
    return { key, label: rate.shortLabel, texto: formatRate(rate.bsPerUnit) };
  });
  const conDegradacion = snapshot.providers.some((provider) => !provider.ok || provider.warning);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8 shrink-0 text-accent" />
          <h1 className="text-xl font-bold leading-none tracking-tight">
            Publicar <span className="text-accent">tasas</span>
          </h1>
        </div>
        <AdminNav activa="hoy" />
      </header>

      <PublicarHoyPanel
        filas={filas}
        horaTasas={formatClock(snapshot.fetchedAt)}
        conDegradacion={conDegradacion}
      />
    </main>
  );
}
