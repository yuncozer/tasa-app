import { buildNewsCaption } from "@/lib/caption";
import { publishDailyPost } from "@/lib/instagram";
import { signNewsImageParams } from "@/lib/news-signature";
import type { ArticleData } from "@/lib/providers/news";
import { fetchArticle } from "@/lib/providers/news";

/**
 * Arma el post de noticia (imagen firmada + caption) sin publicarlo. La
 * usan `previewNewsPost` (para mostrar la vista previa) y `publishNewsPost`
 * (que además dispara la publicación) — un solo lugar que scrapea, arma el
 * caption y firma los parámetros de la imagen.
 */
async function buildNewsPost(url: string): Promise<{ article: ArticleData; caption: string; imageUrl: string }> {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("Falta configurar SITE_URL");

  const article = await fetchArticle(url);
  const caption = buildNewsCaption(article);

  const params = { title: article.title, image: article.imageUrl, source: article.sourceHost };
  const sig = signNewsImageParams(params);
  const imageUrl = new URL(`${siteUrl}/api/og/instagram-post-news`);
  for (const [key, value] of Object.entries(params)) imageUrl.searchParams.set(key, value);
  imageUrl.searchParams.set("sig", sig);

  return { article, caption, imageUrl: imageUrl.toString() };
}

/** Vista previa: mismo resultado que se publicaría, sin publicarlo. */
export async function previewNewsPost(url: string): Promise<{ article: ArticleData; caption: string; imageUrl: string }> {
  return buildNewsPost(url);
}

/**
 * Publica un post ocasional a partir de la URL de un artículo. La usan
 * tanto `app/api/publish-instagram-news` (protegida con `CRON_SECRET`, para
 * disparo manual por curl) como `app/api/admin/publish-noticia` (protegida
 * por la cookie de sesión de `/admin`) — misma lógica, dos formas distintas
 * de autorizar quién puede dispararla.
 */
export async function publishNewsPost(url: string): Promise<{ mediaId: string }> {
  const { imageUrl, caption } = await buildNewsPost(url);
  return publishDailyPost(imageUrl, caption);
}
