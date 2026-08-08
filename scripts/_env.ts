import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Lee `.env.local` para los scripts sueltos, que corren fuera de Next y por
 * tanto no heredan nada de su carga de entorno. No pisa lo que ya venga del
 * shell: así se puede probar con otra credencial sin editar el archivo.
 */
export function cargarEnvLocal(): void {
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
