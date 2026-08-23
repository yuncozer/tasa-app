import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lee `.env.local` para los scripts sueltos, que corren fuera de Next y por
 * tanto no heredan nada de su carga de entorno. No pisa lo que ya venga del
 * shell: así se puede probar con otra credencial sin editar el archivo.
 */
export function cargarEnvLocal(): void {
  // Desde la raíz del repo y no del directorio de trabajo: ejecutar un
  // script desde otra carpeta no encontraba el archivo y seguía sin
  // credenciales, en silencio — que es como el video acababa saliendo con
  // tasas en vivo en vez de las publicadas.
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ruta = path.join(raiz, ".env.local");
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
