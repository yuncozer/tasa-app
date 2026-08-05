import { readFileSync } from "node:fs";
import path from "node:path";
import { buildNewsCaption } from "../lib/caption";
import { signNewsImageParams } from "../lib/news-signature";
import { fetchArticle } from "../lib/providers/news";

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

function cargarEnvLocal(): void {
  const ruta = path.join(process.cwd(), ".env.local");
  let contenido: string;
  try {
    contenido = readFileSync(ruta, "utf8");
  } catch {
    return;
  }
  for (const linea of contenido.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function main() {
  cargarEnvLocal();

  const url = process.argv[2];
  if (!url) {
    console.error("Uso: npx tsx scripts/preview-noticia.ts <url-del-articulo>");
    process.exit(1);
  }

  const article = await fetchArticle(url);
  const params = { title: article.title, image: article.imageUrl, source: article.sourceHost };
  const sig = signNewsImageParams(params);
  const qs = new URLSearchParams({ ...params, sig }).toString();
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
