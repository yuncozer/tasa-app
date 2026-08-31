// Genera los 7 bocetos estáticos del board. Sin movimiento: solo encuadre,
// jerarquía y copy, que es lo que se aprueba en esta pasada.
// Los bloques de sustitución van con borde discontinuo para que se lean como
// boceto y no como diseño terminado.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DESTINO = join(RAIZ, "compositions", "frames");
mkdirSync(DESTINO, { recursive: true });

// Tokens de ESTILOS.md. El boceto ya usa la paleta real: el encuadre se juzga
// mejor sobre el fondo definitivo que sobre gris neutro.
const T = {
  bg: "#0b1120",
  surface: "#131c2f",
  raised: "#1b273f",
  border: "#26324c",
  fg: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#34d399",
};

// Tope de la zona segura: el 83% de 1920. Nada baja de aquí.
const CORTE = 1600;

const baseCss = `
  @font-face { font-family: "Geist Sans"; src: url("assets/geist-latin.woff2") format("woff2");
    font-weight: 100 900; font-display: block; }
  #root { width: 1080px; height: 1920px; position: relative; overflow: hidden;
    font-family: "Geist Sans", system-ui, sans-serif; color: ${T.fg}; }
  .fondo { position: absolute; inset: 0; background: ${T.bg}; }
  .caja { position: absolute; box-sizing: border-box;
    border: 2px dashed ${T.border}; border-radius: 16px; }
  .et { position: absolute; font-size: 22px; letter-spacing: .06em;
    text-transform: uppercase; color: ${T.muted}; }
  .corte { position: absolute; left: 0; right: 0; top: ${CORTE}px; height: 0;
    border-top: 2px dashed rgba(148,163,184,.35); }
  .corte::after { content: "zona segura · 83%"; position: absolute; right: 12px; top: 8px;
    font-size: 18px; color: rgba(148,163,184,.55); letter-spacing: .05em; }
  .tabular { font-variant-numeric: tabular-nums; }
`;

/** Envuelve el fragmento en el template + timeline vacía que exige el contrato. */
function envolver(id, css, cuerpo) {
  return `<template>
  <div id="root" data-composition-id="${id}" data-start="0" data-duration="1"
       data-width="1080" data-height="1920">
    <div id="fondo-${id}" class="fondo clip" data-start="0" data-duration="1" data-track-index="0"></div>
${cuerpo}
    <div class="corte"></div>
  </div>
  <style>${baseCss}${css}</style>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    // Boceto: la línea de tiempo existe para cumplir el contrato, todavía sin fases.
    window.__timelines[${JSON.stringify(id)}] = gsap.timeline({ paused: true });
  </script>
</template>
`;
}

const frames = [];

// ── 01 · Dolor ────────────────────────────────────────────────────────────────
frames.push([
  "01-dolor",
  `
  .video { position: absolute; inset: 0; background: ${T.raised};
    display: flex; align-items: center; justify-content: center; }
  .video span { font-size: 30px; color: ${T.muted}; text-align: center; line-height: 1.5; }
  .velo { position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(11,17,32,.35) 0%, rgba(11,17,32,.6) 55%, rgba(11,17,32,.85) 100%); }
  .interrog { position: absolute; right: 150px; top: 560px;
    font-size: 190px; font-weight: 300; color: ${T.muted}; opacity: .55; line-height: 1; }
`,
  `    <div class="video">
      <span>[ metraje a sangre 1080×1920 ]<br>assets/dolor-calculadora.mp4<br>Pexels #6517557 · RDNE Stock project</span>
    </div>
    <div class="velo"></div>
    <div class="interrog">?</div>
    <div class="et" style="left:80px; top:1500px;">1.8s · entra el signo, nada más</div>`,
]);

// ── 02 · Solución ─────────────────────────────────────────────────────────────
{
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];
  const grid = teclas
    .map((t) => `<div class="tecla${t === "1" || t === "0" ? " on" : ""}">${t}</div>`)
    .join("\n        ");
  frames.push([
    "02-solucion",
    `
  .display { position: absolute; left: 80px; top: 300px; width: 920px; height: 300px;
    background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px;
    display: flex; flex-direction: column; justify-content: center; padding: 0 44px; }
  .display .rot { font-size: 24px; color: ${T.muted}; letter-spacing: .06em; text-transform: uppercase; }
  .display .monto { font-size: 108px; font-weight: 600; line-height: 1; margin-top: 18px; }
  .display .monto em { font-style: normal; font-weight: 400; font-size: 46px; color: ${T.muted}; margin-left: 14px; }
  .resultado { position: absolute; left: 80px; top: 636px; width: 920px; height: 210px;
    border: 1px solid rgba(52,211,153,.4); background: rgba(52,211,153,.1); border-radius: 16px;
    display: flex; flex-direction: column; justify-content: center; padding: 0 44px; }
  .resultado .rot { font-size: 24px; color: ${T.muted}; letter-spacing: .06em; text-transform: uppercase; }
  .resultado .cifra { font-size: 86px; font-weight: 600; color: ${T.accent}; line-height: 1; margin-top: 14px; }
  .resultado .cifra em { font-style: normal; font-weight: 400; font-size: 38px; color: ${T.muted}; margin-left: 14px; }
  .teclado { position: absolute; left: 80px; top: 890px; width: 920px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .tecla { height: 128px; border-radius: 12px; background: ${T.raised};
    border: 1px solid ${T.border}; display: flex; align-items: center; justify-content: center;
    font-size: 52px; font-weight: 600; }
  .tecla.on { background: rgba(52,211,153,.2); border-color: rgba(52,211,153,.4); color: ${T.accent}; }
  .frase { position: absolute; left: 80px; right: 80px; top: 1500px; text-align: center;
    font-size: 42px; font-weight: 500; }
`,
    `    <div class="display">
      <div class="rot">Tienes</div>
      <div class="monto tabular">100<em>USD</em></div>
    </div>
    <div class="resultado">
      <div class="rot">Equivale a</div>
      <div class="cifra tabular">323.063<em>COP</em></div>
    </div>
    <div class="teclado">
        ${grid}
    </div>
    <div class="frase">Con La Tasa lo sabes en dos segundos</div>
    <div class="et" style="left:80px; top:250px;">teclas encendidas = los 3 dígitos que se teclean</div>`,
  ]);
}

// ── 03 · Dato-remate ──────────────────────────────────────────────────────────
frames.push([
  "03-brecha",
  `
  .tarjeta { position: absolute; left: 80px; top: 520px; width: 920px; height: 640px;
    background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .tarjeta .rot { font-size: 26px; color: ${T.muted}; letter-spacing: .08em; text-transform: uppercase; }
  .tarjeta .hero { font-size: 230px; font-weight: 700; color: ${T.accent}; line-height: 1; margin: 34px 0 0; }
  .tarjeta .sub { font-size: 38px; color: ${T.muted}; margin-top: 34px; text-align: center;
    max-width: 700px; line-height: 1.35; }
`,
  `    <div class="tarjeta">
      <div class="rot">La brecha de hoy</div>
      <div class="hero tabular">16,4%</div>
      <div class="sub">de lo que pagas de más fuera del BCV</div>
    </div>
    <div class="et" style="left:80px; top:1240px;">escala 0.9→1.0 al impacto de 8.0s · sin semáforo de color</div>`,
]);

// ── 04 · Bisagra ──────────────────────────────────────────────────────────────
frames.push([
  "04-bisagra",
  `
  .logo { position: absolute; left: 120px; top: 150px; width: 130px; height: 130px;
    border-radius: 32px; background: ${T.surface}; border: 1px solid ${T.border};
    display: flex; align-items: center; justify-content: center; font-size: 20px; color: ${T.muted}; }
  .gratis { position: absolute; left: 0; right: 0; top: 830px; text-align: center;
    font-size: 190px; font-weight: 700; color: ${T.accent}; line-height: 1; letter-spacing: -.02em; }
`,
  `    <div class="logo">logo</div>
    <div class="gratis">Gratis.</div>
    <div class="et" style="left:80px; top:1100px;">el logo se queda en esta esquina hasta el cierre</div>`,
]);

// ── 05 · Instagram ────────────────────────────────────────────────────────────
frames.push([
  "05-instagram",
  `
  .logo { position: absolute; left: 120px; top: 150px; width: 130px; height: 130px;
    border-radius: 32px; background: ${T.surface}; border: 1px solid ${T.border};
    display: flex; align-items: center; justify-content: center; font-size: 20px; color: ${T.muted}; }
  .pila { position: absolute; left: 140px; top: 400px; width: 800px; height: 760px; }
  .post { position: absolute; left: 0; width: 800px; height: 640px; border-radius: 16px;
    background: ${T.surface}; border: 1px solid ${T.border}; }
  .post.c { top: 120px; transform: scale(.9); opacity: .35; }
  .post.b { top: 60px;  transform: scale(.95); opacity: .6; }
  .post.a { top: 0; display: flex; flex-direction: column; }
  .post.a .cab { height: 96px; border-bottom: 1px solid ${T.border};
    display: flex; align-items: center; gap: 18px; padding: 0 26px; }
  .post.a .av { width: 56px; height: 56px; border-radius: 50%; background: ${T.raised}; }
  .post.a .nm { font-size: 26px; font-weight: 500; }
  .post.a .seguir { margin-left: auto; padding: 14px 34px; border-radius: 9999px;
    background: ${T.accent}; color: ${T.bg}; font-size: 24px; font-weight: 600; }
  .post.a .cuerpo { flex: 1; display: flex; align-items: center; justify-content: center;
    font-size: 26px; color: ${T.muted}; text-align: center; line-height: 1.5; }
  .dedo { position: absolute; left: 690px; top: 430px; width: 120px; height: 120px;
    border-radius: 50%; border: 3px solid ${T.fg}; opacity: .85;
    display: flex; align-items: center; justify-content: center; font-size: 46px; }
  .frase { position: absolute; left: 80px; right: 80px; top: 1330px; text-align: center;
    font-size: 40px; font-weight: 500; line-height: 1.35; }
  .handle { position: absolute; left: 0; right: 0; top: 1470px; text-align: center;
    font-size: 44px; font-weight: 600; color: ${T.accent}; }
`,
  `    <div class="logo">logo</div>
    <div class="pila">
      <div class="post c"></div>
      <div class="post b"></div>
      <div class="post a">
        <div class="cab">
          <div class="av"></div>
          <div class="nm">latasa.online</div>
          <div class="seguir">Seguir</div>
        </div>
        <div class="cuerpo">[ tarjeta del carrusel diario ]<br>estilo /api/og/instagram-post</div>
      </div>
    </div>
    <div class="dedo">☝</div>
    <div class="frase">Cada mañana y cada tarde,<br>tasas nuevas en Instagram</div>
    <div class="handle">@latasa.online</div>
    <div class="et" style="left:80px; top:1230px;">el dedo entra de fuera y pulsa Seguir</div>`,
]);

// ── 06 · WhatsApp ─────────────────────────────────────────────────────────────
frames.push([
  "06-whatsapp",
  `
  .logo { position: absolute; left: 120px; top: 150px; width: 130px; height: 130px;
    border-radius: 32px; background: ${T.surface}; border: 1px solid ${T.border};
    display: flex; align-items: center; justify-content: center; font-size: 20px; color: ${T.muted}; }
  .canal { position: absolute; left: 140px; top: 400px; width: 800px;
    background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px; overflow: hidden; }
  .canal .cab { height: 130px; display: flex; align-items: center; gap: 22px; padding: 0 30px;
    border-bottom: 1px solid ${T.border}; }
  .canal .av { width: 76px; height: 76px; border-radius: 50%; background: ${T.raised}; }
  .canal .nm { font-size: 30px; font-weight: 600; }
  .canal .sub { font-size: 22px; color: ${T.muted}; margin-top: 4px; }
  .canal .burbuja { margin: 30px; padding: 26px 30px; border-radius: 16px; background: ${T.raised};
    font-size: 26px; color: ${T.muted}; line-height: 1.55; }
  .canal .burbuja b { color: ${T.fg}; font-weight: 600; }
  .unirse { margin: 0 30px 30px; height: 104px; border-radius: 9999px; background: ${T.accent};
    color: ${T.bg}; font-size: 32px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; }
  .dedo { position: absolute; left: 480px; top: 1030px; width: 120px; height: 120px;
    border-radius: 50%; border: 3px solid ${T.fg}; opacity: .85;
    display: flex; align-items: center; justify-content: center; font-size: 46px; }
  .frase { position: absolute; left: 80px; right: 80px; top: 1400px; text-align: center;
    font-size: 40px; font-weight: 500; line-height: 1.35; }
`,
  `    <div class="logo">logo</div>
    <div class="canal">
      <div class="cab">
        <div class="av"></div>
        <div>
          <div class="nm">La Tasa</div>
          <div class="sub">Canal · Tasas del día</div>
        </div>
      </div>
      <div class="burbuja">📊 <b>TASAS DE HOY</b><br>Dólar BCV · Binance · Peso<br>[ mensaje del canal ]</div>
      <div class="unirse">Unirse al canal</div>
    </div>
    <div class="dedo">☝</div>
    <div class="frase">Y el canal de WhatsApp,<br>directo a tu chat</div>
    <div class="et" style="left:80px; top:1310px;">el dedo pulsa «Unirse al canal»</div>`,
]);

// ── 07 · Cierre ───────────────────────────────────────────────────────────────
frames.push([
  "07-cierre",
  `
  .logo { position: absolute; left: 50%; top: 560px; transform: translateX(-50%);
    width: 260px; height: 260px; border-radius: 64px; background: ${T.surface};
    border: 1px solid ${T.border}; display: flex; align-items: center; justify-content: center;
    font-size: 26px; color: ${T.muted}; }
  .marca { position: absolute; left: 0; right: 0; top: 880px; text-align: center;
    font-size: 92px; font-weight: 700; letter-spacing: -.02em; }
  .handle { position: absolute; left: 0; right: 0; top: 1010px; text-align: center;
    font-size: 46px; font-weight: 600; color: ${T.accent}; }
  .wa { position: absolute; left: 50%; top: 1110px; transform: translateX(-50%);
    width: 104px; height: 104px; border-radius: 50%; background: ${T.surface};
    border: 1px solid ${T.border}; display: flex; align-items: center; justify-content: center;
    font-size: 40px; }
  .frase { position: absolute; left: 0; right: 0; top: 1300px; text-align: center;
    font-size: 44px; font-weight: 500; color: ${T.muted}; }
`,
  `    <div class="logo">logo</div>
    <div class="marca">La Tasa</div>
    <div class="handle">@latasa.online</div>
    <div class="wa">✆</div>
    <div class="frase">Síguenos. Únete.</div>
    <div class="et" style="left:80px; top:1440px;">el logo llega desde la esquina · chime y silencio</div>`,
]);

for (const [id, css, cuerpo] of frames) {
  const ruta = join(DESTINO, `${id}.html`);
  writeFileSync(ruta, envolver(id, css, cuerpo), "utf8");
  console.log("boceto:", `compositions/frames/${id}.html`);
}
console.log(`\n${frames.length} bocetos escritos.`);
