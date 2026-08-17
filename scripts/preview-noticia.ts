import { buildNewsCaption, conPieEnlaces } from "../lib/caption";
import { generarSlugPost } from "../lib/enlaces";
import { signNewsImageParams } from "../lib/news-signature";
import { fetchArticle } from "../lib/providers/news";
import { cargarEnvLocal } from "./_env";

/**
 * Arma la URL local firmada de `/api/og/instagram-post-news` a partir de un
 * artículo real, y muestra el caption tal como saldría — para ver el
 * resultado completo (imagen + texto) sin llamar a la API de Instagram.
 * Uso:
 *
 *   npx tsx scripts/preview-noticia.ts <url-del-articulo>
 *
 * Requiere que `npm run dev` esté corriendo en otra terminal y que
 * `.env.local` tenga `CRON_SECRET` (el mismo que usa la API).
 */

async function main() {
  cargarEnvLocal();

  const url = process.argv[2];
  if (!url) {
    console.error("Uso: npx tsx scripts/preview-noticia.ts <url-del-articulo>");
    process.exit(1);
  }

  const article = await fetchArticle(url);
  // `proporcion` entra en el conjunto firmado aunque sea la de por defecto: la
  // ruta la incluye siempre, así que omitirla invalidaría la firma (403).
  const params = {
    title: article.title,
    image: article.imageUrl,
    source: article.sourceHost,
    proporcion: "1:1",
  };
  const sig = signNewsImageParams(params);
  const qs = new URLSearchParams({ ...params, sig }).toString();

  // El pie de enlaces (post + calculadora + canal) no lo agrega
  // `buildNewsCaption`: se suma al publicar de verdad, con un slug propio de
  // `/p/<slug>`. Aquí se genera uno solo para que el caption impreso se vea
  // igual que el que de verdad saldría a publicar.
  const slug = generarSlugPost();
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
  const caption = conPieEnlaces(buildNewsCaption(article), `${siteUrl}/p/${slug}`);

  console.log("--- Imagen (ábrela en el navegador) ---");
  console.log(`http://localhost:3000/api/og/instagram-post-news?${qs}`);
  console.log();
  console.log("--- Caption ---");
  console.log(caption);
  console.log();
  console.log(`(${caption.length} caracteres)`);
}

main();
