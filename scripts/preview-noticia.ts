import { buildNewsCaption } from "../lib/caption";
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

  // Tal cual saldría publicado: `buildNewsCaption` ya cierra en sus hashtags y
  // no se le añade nada después. El pie de tres enlaces no aparece aquí porque
  // ya no va en el post, solo en el mensaje que se copia desde `/admin/canal`.
  const caption = buildNewsCaption(article);

  console.log("--- Imagen (ábrela en el navegador) ---");
  console.log(`http://localhost:3000/api/og/instagram-post-news?${qs}`);
  console.log();
  console.log("--- Caption ---");
  console.log(caption);
  console.log();
  console.log(`(${caption.length} caracteres)`);
}

main();
