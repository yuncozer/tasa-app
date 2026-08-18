import { buildNewsCaption } from "../lib/caption";
import { iaDisponible } from "../lib/ia";
import { redactarAnalisisSemanal, redactarCaptionNoticia } from "../lib/ia-textos";
import { fetchArticle } from "../lib/providers/news";
import { getRates } from "../lib/rates";
import { construirReporteSemanal } from "../lib/semanal";
import { cargarEnvLocal } from "./_env";

/**
 * Muestra lo que redactaría la IA, sin publicar ni tocar `/admin`. Uso:
 *
 *   npx tsx scripts/preview-ia.ts noticia "https://url-del-articulo"
 *   npx tsx scripts/preview-ia.ts semanal
 *
 * Es donde se iteran los prompts de `lib/ia-textos.ts`: probarlos desde el
 * formulario obliga a cargar una imagen y a mirar el teléfono para cada
 * cambio de una coma.
 *
 * Necesita `OPENROUTER_API_KEY` en `.env.local` (y, para `semanal`, las dos de
 * Supabase, salvo que el histórico esté vacío: entonces sale sin comparaciones).
 * No necesita `npm run dev`: no hay ninguna URL que servir.
 *
 * Imprime también el texto de plantilla, que es a lo que la aplicación cae
 * cuando ningún modelo responde: lo que hay que comparar no es el texto de la
 * IA contra la nada, sino contra lo que ya se publicaba.
 */

async function noticia(url: string) {
  const article = await fetchArticle(url);

  console.log("--- Plantilla (lo que sale hoy) ---\n");
  console.log(buildNewsCaption(article));

  const texto = await redactarCaptionNoticia({
    title: article.title,
    sourceHost: article.sourceHost,
    description: article.description,
  });

  console.log("\n--- IA ---\n");
  console.log(texto ?? "(ningún modelo respondió: la aplicación usaría la plantilla de arriba)");
}

async function semanal() {
  const reporte = await construirReporteSemanal(await getRates());
  const texto = await redactarAnalisisSemanal(reporte);

  console.log(`--- Análisis de la semana (${reporte.rangoTexto}) ---\n`);
  console.log(texto ?? "(ningún modelo respondió: el caption saldría sin análisis, como hasta ahora)");
}

async function main() {
  cargarEnvLocal();

  if (!iaDisponible()) {
    console.error("Falta OPENROUTER_API_KEY en .env.local");
    process.exit(1);
  }

  const [tipo, argumento] = process.argv.slice(2);

  if (tipo === "semanal") return semanal();
  if (tipo === "noticia" && argumento) return noticia(argumento);

  console.error('Uso: npx tsx scripts/preview-ia.ts noticia "<url>" | semanal');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
