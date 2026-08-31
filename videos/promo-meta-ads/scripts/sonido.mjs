// Monta el diseño sonoro en la raíz de index.html.
//
// Va en un script y no a mano porque `assemble-index.mjs` reescribe index.html
// entero: si el sonido viviera solo en ese archivo, un re-ensamblado lo borraría
// en silencio. Volver a correr este script lo repone.
//
// La paleta es la de `videos/tasas-del-dia` — los mismos cinco archivos — para que
// las dos piezas de la marca suenen a la misma cosa. Cada pista lleva su propio
// `data-track-index` para poder mezclarlas por separado en Studio o en CapCut.
//
// Y también declara las variables de composición, por el mismo motivo.
import { readFileSync, writeFileSync } from "node:fs";

const SFX = ".media/audio/sfx";

// [id, archivo, inicio global, duración, volumen, mediaStart, comentario]
const pistas = [
  ["tick-1", "sfx_001", 2.70, 0.5, 0.2, null, "primer dígito"],
  ["tick-2", "sfx_001", 2.78, 0.5, 0.2, null, "segundo dígito"],
  ["tick-3", "sfx_001", 2.86, 0.5, 0.2, null, "tercer dígito"],
  ["whoosh-resultado", "sfx_004", 2.88, 1.0, 0.22, null, "el resultado aterriza: el pago de la escena 2"],
  ["riser", "sfx_002", 6.50, 1.5, 0.18, 8.5, "tensión durante la quietud previa al remate"],
  ["impacto", "sfx_003", 8.00, 2.2, 0.30, null, "la brecha aterriza: el pago de la pieza"],
  ["sparkle", "sfx_005", 8.42, 0.9, 0.14, null, "cola breve tras el impacto"],
  ["chime-bisagra", "sfx_005", 9.50, 1.0, 0.24, null, "entra el logo y «Gratis.»"],
  ["whoosh-ig", "sfx_004", 10.50, 1.0, 0.18, null, "entrada de la escena de Instagram"],
  ["whoosh-wa", "sfx_004", 12.00, 1.0, 0.18, null, "entrada de la escena de WhatsApp"],
  ["chime-cierre", "sfx_005", 13.50, 1.5, 0.28, null, "cierre; después, silencio"],
];

const variables = [
  { id: "montoEjemplo", type: "string", label: "Monto que se teclea", default: "100" },
  { id: "monedaOrigen", type: "string", label: "Moneda origen", default: "USD" },
  { id: "monedaDestino", type: "string", label: "Moneda destino", default: "COP" },
  { id: "resultadoEjemplo", type: "string", label: "Resultado ya formateado", default: "323.063" },
  { id: "brechaPorcentaje", type: "string", label: "Brecha (%)", default: "16,4%" },
  { id: "handleInstagram", type: "string", label: "Handle de Instagram", default: "@latasa.online" },
  { id: "enlaceCanalWhatsapp", type: "string", label: "Enlace del canal de WhatsApp", default: "latasa.online/wa" },
];

let t = readFileSync("index.html", "utf8");

// ── Variables de composición ────────────────────────────────────────────────
const attr = `data-composition-variables='${JSON.stringify(variables)}'`;
t = t.replace(/<html([^>]*)>/, (_m, resto) => {
  const limpio = resto.replace(/\s*data-composition-variables='[^']*'/, "");
  return `<html${limpio} ${attr}>`;
});

// ── Pistas de sonido ────────────────────────────────────────────────────────
// Se retiran las anteriores antes de reponerlas, para que el script sea idempotente.
t = t.replace(/\n *<!-- sonido -->[\s\S]*?<!-- \/sonido -->\n/, "\n");

const lineas = pistas.map(([id, archivo, inicio, dur, vol, mediaStart, nota], i) => {
  const ms = mediaStart === null ? "" : ` data-media-start="${mediaStart}"`;
  return `      <!-- ${nota} -->\n      <audio id="sfx-${id}" src="${SFX}/${archivo}.mp3" data-start="${inicio}" data-duration="${dur}" data-track-index="${20 + i}" data-volume="${vol}"${ms}></audio>`;
});

const bloque = `
      <!-- sonido -->
${lineas.join("\n")}
      <!-- /sonido -->
`;

const ancla = '<div data-hf-id="hf-zdt9" id="el-01-dolor"';
const pos = t.indexOf(ancla);
if (pos === -1) throw new Error("no encuentro la primera escena en index.html");
const inicioLinea = t.lastIndexOf("\n", pos);
t = t.slice(0, inicioLinea) + bloque + t.slice(inicioLinea + 1);

writeFileSync("index.html", t, "utf8");
console.log(`${pistas.length} pistas de sonido montadas + ${variables.length} variables declaradas`);
