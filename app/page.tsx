import { Calculator } from "@/components/Calculator";
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
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">
          Tas<span className="text-[color:var(--accent)]">app</span>
        </h1>
        <p className="text-sm text-[color:var(--muted)]">
          Cuánto vale tu dinero hoy en la frontera, en bolívares.
        </p>
      </header>

      <RatePanel snapshot={snapshot} />
      <Calculator snapshot={snapshot} />
    </main>
  );
}
