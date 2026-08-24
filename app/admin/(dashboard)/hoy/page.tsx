import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PublicarHoyPanel } from "@/components/PublicarHoyPanel";
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
  const snapshot = await getRates();
  const filas = RATE_ORDER.filter((key) => key !== "VES").map((key) => {
    const rate = snapshot.rates[key];
    return { key, label: rate.shortLabel, texto: formatRate(rate.bsPerUnit) };
  });
  const conDegradacion = snapshot.providers.some((provider) => !provider.ok || provider.warning);

  return (
    <>
      <AdminPageHeader
        titulo="Publicar tasas"
        descripcion="Dispara el carrusel del día fuera de las 9:00 am y las 6:00 pm del cron."
      />

      <PublicarHoyPanel
        filas={filas}
        horaTasas={formatClock(snapshot.fetchedAt)}
        conDegradacion={conDegradacion}
      />
    </>
  );
}
