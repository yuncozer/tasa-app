/** Valida que una URL de artículo sea http(s) antes de intentar scrapearla. */
export function esUrlValida(valor: string | null | undefined): valor is string {
  if (!valor) return false;
  try {
    const url = new URL(valor);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
