import { buildCaptionSemanal } from "../lib/caption";
import type { ClaveHistorico, PuntoHistorico } from "../lib/historico";
import { getRates } from "../lib/rates";
import { armarReporteSemanal, construirReporteSemanal } from "../lib/semanal";
import { cargarEnvLocal } from "./_env";

/**
 * Muestra el reporte semanal tal como saldría —caption y las dos URLs de la
 * imagen— sin publicar nada. Uso:
 *
 *   npx tsx scripts/preview-semanal.ts
 *   npx tsx scripts/preview-semanal.ts --sin-historico
 *
 * Requiere `npm run dev` corriendo en otra terminal (las URLs son locales) y,
 * salvo con `--sin-historico`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en
 * `.env.local`.
 *
 * Es más simple que `preview-noticia.ts` porque esta imagen no va firmada: para
 * iterar el diseño basta con editar la plantilla y recargar el navegador, sin
 * volver a correr el script.
 *
 * `--sin-historico` arma el reporte con una comparativa vacía, para ver la
 * degradación de los primeros siete días sin esperar una semana. El flag vive
 * **aquí y nunca en la ruta**: un parámetro que falsea datos en una URL pública
 * es justo lo que la ausencia de firma no debe permitir.
 */

async function main() {
  cargarEnvLocal();

  const sinHistorico = process.argv.includes("--sin-historico");
  const snapshot = await getRates();

  const reporte = sinHistorico
    ? armarReporteSemanal(snapshot, new Map<ClaveHistorico, PuntoHistorico>())
    : await construirReporteSemanal(snapshot);

  const base = "http://localhost:3000/api/og/instagram-semanal";

  console.log("--- Imágenes (ábrelas en el navegador) ---");
  console.log(`${base}?proporcion=1:1`);
  console.log(`${base}?proporcion=9:16`);
  console.log();
  console.log(`--- Semana: ${reporte.rangoTexto} ---`);
  for (const fila of reporte.filas) {
    console.log(
      `${fila.titulo}: ${fila.valorTexto} · ${fila.direccion}` +
        (fila.variacion === null ? "" : ` (${fila.variacion.toFixed(2)} ${fila.unidadVariacion})`),
    );
  }
  console.log();
  console.log("--- Caption ---");
  console.log(buildCaptionSemanal(reporte));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
