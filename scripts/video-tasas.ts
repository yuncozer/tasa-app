import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

import { getRates } from "../lib/rates";
import { snapshotDelDia } from "../lib/snapshot-hoy";
import { armarVariablesVideo, DIR_VIDEO, RUTA_VARIABLES, RUTA_VIDEO } from "../lib/video-tasas";
import { cargarEnvLocal } from "./_env";

/**
 * Genera el video vertical de tasas del día a partir de lo que ya se publicó.
 *
 *   npx tsx scripts/video-tasas.ts                 # datos del último post
 *   npx tsx scripts/video-tasas.ts --render        # además renderiza el MP4
 *   npx tsx scripts/video-tasas.ts --en-vivo       # tasas del momento
 *
 * La plantilla vive en `videos/tasas-del-dia/index.html` y recibe los datos por
 * variables de HyperFrames. Las variables las arma `lib/video-tasas.ts`, que se
 * comparte con `/admin/video`: si cada uno hiciera las suyas, el video generado
 * desde el teléfono podría no coincidir con el generado desde la terminal.
 *
 * **Lee `snapshot_hoy`, no `getRates()`.** Esa tabla guarda el snapshot exacto
 * con el que el cron armó el caption justo antes de publicar. El video se
 * comparte junto a esa publicación, así que tiene que decir lo mismo: leyendo
 * las tasas en vivo, un Binance que se moviera entre medias dejaría el video
 * afirmando una cifra distinta de la que la gente ya tiene en el feed.
 * `--en-vivo` existe para probar el diseño fuera de las horas de publicación, y
 * avisa por consola de que lo generado no corresponde a ningún post.
 *
 * Requiere `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`, salvo
 * con `--en-vivo`. Para `--render` hace falta `ffmpeg` en el PATH.
 */

async function main() {
  cargarEnvLocal();

  const enVivo = process.argv.includes("--en-vivo");
  const renderizar = process.argv.includes("--render");

  const snapshot = enVivo ? await getRates() : await snapshotDelDia();

  if (enVivo) {
    console.warn(
      "⚠ --en-vivo: estas tasas son del momento, NO las de ningún post publicado.\n" +
        "  Sirve para probar el diseño; no publiques el resultado junto al post del día.\n",
    );
  }

  const variables = armarVariablesVideo(snapshot);

  mkdirSync(DIR_VIDEO, { recursive: true });
  writeFileSync(RUTA_VARIABLES, `${JSON.stringify(variables, null, 2)}\n`, "utf8");

  console.log(`--- Datos (capturados ${snapshot.fetchedAt}) ---`);
  for (let n = 1; n <= 4; n += 1) {
    console.log(
      `${String(variables[`fila${n}Label`]).padEnd(24)} ` +
        `${String(variables[`fila${n}Valor`]).padStart(10)} ${variables[`fila${n}Unidad`]}`,
    );
  }
  console.log(`${"Brecha".padEnd(24)} ${String(variables.brecha)} %`);
  console.log(`\nVariables escritas en ${RUTA_VARIABLES}`);

  if (!renderizar) {
    console.log("\nPara renderizar:");
    console.log("  npx tsx scripts/video-tasas.ts --render");
    return;
  }

  // Orden única en vez de array de argumentos: en Windows `npx` es un `.cmd`,
  // que Node se niega a ejecutar sin shell (EINVAL), y pasar un array *con*
  // shell es lo que avisa DEP0190 por concatenar sin escapar. Aquí no hay nada
  // que escapar — los argumentos son constantes de este archivo.
  console.log("\nRenderizando…");
  execSync(
    "npx hyperframes render . --skill=motion-graphics -q high " +
      "--variables-file variables.json -o ./renders/video.mp4",
    { cwd: DIR_VIDEO, stdio: "inherit" },
  );
  console.log(`\nListo: ${RUTA_VIDEO}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
