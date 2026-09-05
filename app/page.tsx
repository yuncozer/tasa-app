import Link from "next/link";
import { Calculator } from "@/components/Calculator";
import { Footer } from "@/components/Footer";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Logo } from "@/components/Logo";
import { OfflineNotice } from "@/components/OfflineNotice";
import { ParadaCard } from "@/components/ParadaCard";
import { RatePanel } from "@/components/RatePanel";
import { AvisoTasas } from "@/components/AvisoTasas";
import { SocialCTA } from "@/components/SocialCTA";
import { paradaDelDia } from "@/lib/parada";
import { getRates, pedirTasasFrescas } from "@/lib/rates";

/**
 * Las tasas se obtienen en el servidor, así que se ven apenas carga la página,
 * sin esperar a que arranque el JavaScript. La página se renderiza por petición
 * y quien evita golpear a los proveedores es la caché de `getRates`, con un TTL
 * de 5 minutos.
 *
 * El botón "Actualizar tasas" navega con `?actualizar=<marca de tiempo>`: sin ese
 * parámetro la petición volvería a leer la caché y el usuario vería los mismos
 * números. El parámetro es público —lo puede escribir cualquiera—, así que
 * quien decide si de verdad se vuelve a preguntar es `pedirTasasFrescas()`,
 * que solo tira las tasas y solo si ya tienen unos segundos.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ actualizar?: string }>;
}) {
  const { actualizar } = await searchParams;
  if (actualizar) pedirTasasFrescas();

  const [snapshot, parada] = await Promise.all([getRates(), paradaDelDia()]);

  // El margen superior respeta el área segura porque, instalada en iPhone, la app
  // se dibuja por debajo de la barra de estado: sin eso, la hora y la batería se
  // montan sobre el nombre.
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <OfflineNotice fetchedAt={snapshot.fetchedAt} />

      <header className="flex items-center gap-3">
        <Logo className="h-10 w-10 shrink-0 text-[color:var(--accent)]" />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold leading-none tracking-tight">
            La <span className="text-[color:var(--accent)]">Tasa</span>
          </h1>
          <p className="text-sm text-[color:var(--muted)]">Cuánto vale tu dinero hoy</p>
        </div>
      </header>

      {/* Debajo de la cabecera: al final de la página nadie llegaba a verlo. */}
      <InstallPrompt />

      <RatePanel snapshot={snapshot} />

      <ParadaCard parada={parada} />

      <Link
        href="/historial"
        className="self-center text-sm font-medium text-[color:var(--muted)] underline underline-offset-2"
      >
        Ver historial de tasas →
      </Link>

      <Calculator snapshot={snapshot} />

      {/* Debajo de la calculadora y antes del CTA de redes: quien acaba de
          hacer una cuenta es el que puede querer que le avisen mañana, y
          ofrecérselo antes de que haya usado la app sería pedirle algo sin
          haberle dado nada. Se pinta solo donde el navegador puede recibirlos. */}
      <AvisoTasas />
      <SocialCTA />
      <Footer fetchedAt={snapshot.fetchedAt} />
    </main>
  );
}
