import { armarAlertaBrecha, construirAlertaBrecha } from "../lib/alerta-brecha";
import { buildCaptionBrecha } from "../lib/caption";
import type { ClaveHistorico, PuntoHistorico } from "../lib/historico";
import { getRates } from "../lib/rates";
import { cargarEnvLocal } from "./_env";

/**
 * Muestra la alerta de brecha tal como saldría —caption y las dos URLs de la
 * imagen— sin publicar nada. Uso:
 *
 *   npx tsx scripts/preview-brecha.ts
 *   npx tsx scripts/preview-brecha.ts --sin-historico
 *
 * Requiere `npm run dev` corriendo en otra terminal (las URLs son locales) y,
 * salvo con `--sin-historico`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en
 * `.env.local`.
 *
 * Como el semanal, la imagen no va firmada: para iterar el diseño basta con
 * editar la plantilla y recargar el navegador. Y `--sin-historico` vive **aquí
 * y nunca en la ruta**, por el mismo motivo: un parámetro que falsea datos en
 * una URL pública es justo lo que la ausencia de firma no debe permitir.
 */

async function main() {
  cargarEnvLocal();

  const sinHistorico = process.argv.includes("--sin-historico");
  const snapshot = await getRates();

  const alerta = sinHistorico
    ? armarAlertaBrecha(snapshot, new Map<ClaveHistorico, PuntoHistorico>())
    : await construirAlertaBrecha(snapshot);

  const base = "http://localhost:3000/api/og/instagram-brecha";

  console.log("--- Imágenes (ábrelas en el navegador) ---");
  console.log(`${base}?proporcion=1:1`);
  console.log(`${base}?proporcion=9:16`);
  console.log();
  console.log(`--- ${alerta.titular} ---`);
  console.log(`Hoy: ${alerta.brechaTexto} · hace una semana: ${alerta.brechaAntesTexto} · ${alerta.direccion}`);
  console.log(`USDT Binance (venta): ${alerta.valorParaleloTexto} · Dólar BCV: ${alerta.valorOficialTexto}`);
  if (!alerta.publicable) console.log("Falta una de las dos tasas: no hay alerta publicable.");
  console.log();
  console.log("--- Caption ---");
  console.log(buildCaptionBrecha(alerta));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
