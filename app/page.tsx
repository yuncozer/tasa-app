import { Calculator } from "@/components/Calculator";
import { Footer } from "@/components/Footer";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Logo } from "@/components/Logo";
import { OfflineNotice } from "@/components/OfflineNotice";
import { RatePanel } from "@/components/RatePanel";
import { clearCache } from "@/lib/cache";
import { getRates } from "@/lib/rates";

/**
 * Las tasas se obtienen en el servidor, así que se ven apenas carga la página,
 * sin esperar a que arranque el JavaScript. La página se renderiza por petición
 * y quien evita golpear a los proveedores es la caché de `getRates`, con un TTL
 * de 5 minutos.
 *
 * El botón "Actualizar tasas" navega con `?actualizar=<marca de tiempo>`: sin ese
 * parámetro la petición volvería a leer la caché y el usuario vería los mismos
 * números.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ actualizar?: string }>;
}) {
  const { actualizar } = await searchParams;
  if (actualizar) clearCache();

  const snapshot = await getRates();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <OfflineNotice fetchedAt={snapshot.fetchedAt} />

      <header className="flex items-center gap-3">
        <Logo className="h-10 w-10 shrink-0 text-[color:var(--accent)]" />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold leading-none tracking-tight">
            Tas<span className="text-[color:var(--accent)]">app</span>
          </h1>
          <p className="text-sm text-[color:var(--muted)]">Cuánto vale tu dinero hoy</p>
        </div>
      </header>

      <RatePanel snapshot={snapshot} />
      <Calculator snapshot={snapshot} />
      <InstallPrompt />
      <Footer fetchedAt={snapshot.fetchedAt} />
    </main>
  );
}
