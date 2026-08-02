/**
 * Rasteriza el logo de la taza a los PNG que necesitan el manifiesto e iOS.
 *
 * Los PNG se versionan en el repositorio: se regeneran solo cuando cambie el
 * logo, así que no hace falta que `sharp` intervenga en cada compilación.
 *
 *   node scripts/generar-iconos.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const FONDO = "#0b1120";
const ACENTO = "#34d399";

/**
 * La taza sobre un lienzo cuadrado.
 *
 * `margen` es la fracción del lado que queda libre alrededor del dibujo: los
 * iconos `maskable` necesitan holgura porque Android los recorta en círculo o en
 * cuadrado redondeado, y con poco margen se comería el asa y el plato.
 */
function taza({ lado, margen, radio }) {
  const dibujo = lado * (1 - 2 * margen);
  const escala = dibujo / 24;
  const desplazamiento = lado * margen;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <rect width="${lado}" height="${lado}" rx="${radio}" fill="${FONDO}"/>
  <g transform="translate(${desplazamiento} ${desplazamiento}) scale(${escala})"
     fill="none" stroke="${ACENTO}" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M7.5 2.2c-.7.9-.7 1.8 0 2.7"/>
    <path d="M11 2.2c-.7.9-.7 1.8 0 2.7"/>
    <path d="M14.5 2.2c-.7.9-.7 1.8 0 2.7"/>
    <path d="M3.5 8h13.5v5.6a5.2 5.2 0 0 1-5.2 5.2H8.7A5.2 5.2 0 0 1 3.5 13.6V8Z"/>
    <path d="M17 9.6h1.3a2.6 2.6 0 0 1 0 5.2H17"/>
    <path d="M2.5 21.3h16"/>
  </g>
</svg>`);
}

const ICONOS = [
  { archivo: "public/icon-192.png", lado: 192, margen: 0.12, radio: 42 },
  { archivo: "public/icon-512.png", lado: 512, margen: 0.12, radio: 112 },
  // Con recorte de por medio, el dibujo se queda dentro del 60 % central.
  { archivo: "public/icon-maskable-512.png", lado: 512, margen: 0.2, radio: 0 },
  // iOS aplica su propio redondeo, así que el lienzo va cuadrado y opaco.
  { archivo: "app/apple-icon.png", lado: 180, margen: 0.14, radio: 0 },
];

await mkdir("public", { recursive: true });

for (const { archivo, lado, margen, radio } of ICONOS) {
  const png = await sharp(taza({ lado, margen, radio })).png().toBuffer();
  await writeFile(archivo, png);
  console.log(`${archivo} · ${lado}×${lado}`);
}
