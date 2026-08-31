// Construye las 7 escenas animadas del Reel.
//
// Un solo generador en vez de siete archivos sueltos por el mismo motivo por el
// que la app tiene un solo `globals.css`: la paleta, la tipografía y el envoltorio
// del contrato viven en un sitio, y una escena nueva no puede desviarse por
// descuido. Cada escena aporta solo su CSS, su cuerpo y su línea de tiempo.
//
// Reglas duras que este archivo hace cumplir (ver STORYBOARD.md → Video direction):
//   · Ningún color fuera de los nueve tokens de ESTILOS.md.
//   · `power3` en todo. Nada de back/bounce/elastic.
//   · Entradas con fromTo, para que un seek a t=0 caiga en el estado inicial.
//   · Sin repeat/yoyo, sin Math.random, sin Date.now: el render es determinista.
//   · Sin movimiento de salida salvo en la escena final.
//   · Todo el contenido sobre y ≤ 1600.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DESTINO = join(RAIZ, "compositions", "frames");
mkdirSync(DESTINO, { recursive: true });

const T = {
  bg: "#0b1120",
  surface: "#131c2f",
  raised: "#1b273f",
  border: "#26324c",
  fg: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#34d399",
};

const SEGURO = 1600; // 83% de 1920: debajo de aquí Instagram pone su propia interfaz.

const cssBase = `
  @font-face { font-family: "Geist Sans"; src: url("assets/geist-latin.woff2") format("woff2");
    font-weight: 100 900; font-display: block; }
  #root { width: 1080px; height: 1920px; position: relative; overflow: hidden;
    font-family: "Geist Sans", system-ui, sans-serif; color: ${T.fg};
    -webkit-font-smoothing: antialiased; }
  .suelo { position: absolute; inset: 0; background: ${T.bg}; }
  .tabular { font-variant-numeric: tabular-nums; }
  .oculto-var { display: none; }
`;

/**
 * Lee el valor de una variable de composición. El elemento fuente lleva
 * `data-var-text`, así que el runtime lo sustituye; si aún no lo hizo, el texto
 * escrito en el HTML es el respaldo. En ambos casos el resultado es determinista.
 */
const helperVar = `
    function valorVar(raiz, id, porDefecto) {
      var el = raiz.querySelector('[data-var-source="' + id + '"]');
      var v = el && el.textContent ? el.textContent.trim() : "";
      return v || porDefecto;
    }`;

/** Envoltorio del contrato: template único, root con id de composición, timeline pausada. */
function envolver(id, css, cuerpo, js) {
  return `<template>
  <div id="root" data-composition-id="${id}" data-start="0" data-duration="1"
       data-width="1080" data-height="1920">
    <div id="suelo-${id}" class="suelo clip" data-start="0" data-duration="1" data-track-index="0"></div>
${cuerpo}
  </div>
  <style>${cssBase}${css}</style>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script>
    (function () {
      var raiz = document.currentScript.parentNode.querySelector('[data-composition-id="${id}"]')
        || document.querySelector('[data-composition-id="${id}"]');
      var q = function (sel) { return raiz.querySelector(sel); };
      var qa = function (sel) { return Array.prototype.slice.call(raiz.querySelectorAll(sel)); };
${helperVar}
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      window.__timelines[${JSON.stringify(id)}] = tl;
${js}
    })();
  </script>
</template>
`;
}

// Mano que toca: puño + índice extendido + pulgar. Se dibuja con primitivas y no
// con un emoji, que cada sistema renderiza distinto y rompería el determinismo.
//
// El radio del puño es deliberadamente bajo (24 sobre 74×68). Con un radio alto
// se convierte en círculo, y un círculo bajo una cápsula no se lee como una mano:
// se lee como una piruleta. La punta del índice queda en (58, 6) del viewBox, que
// es el punto que hay que hacer coincidir con el botón.
// El viewBox coincide con el tamaño de render, así que las coordenadas de abajo
// son píxeles del lienzo final y la punta se puede situar sin conversiones.
const MANO_PUNTA = { x: 87, y: 12 };
function manoSvg(id) {
  return `<svg id="${id}" class="mano" viewBox="0 0 200 250" width="200" height="250" aria-hidden="true">
        <g fill="${T.fg}" stroke="${T.bg}" stroke-width="7" stroke-linejoin="round">
          <rect x="25" y="130" width="38" height="70" rx="19" transform="rotate(-25 44 165)"/>
          <rect x="138" y="88" width="33" height="48" rx="16"/>
          <rect x="108" y="78" width="35" height="55" rx="17"/>
          <rect x="68" y="12" width="38" height="112" rx="19"/>
          <rect x="42" y="110" width="130" height="115" rx="42"/>
        </g>
      </svg>`;
}

/** Coloca la mano de modo que la punta del índice caiga exactamente en (x, y). */
function manoEn(x, y) {
  return `left: ${x - MANO_PUNTA.x}px; top: ${y - MANO_PUNTA.y}px;`;
}

const escenas = [];

/* ── 01 · Dolor ─────────────────────────────────────────────────────────────
   Metraje a sangre. Todo el movimiento de cámara se gasta en la primera mitad;
   la segunda queda inmóvil para que el signo de interrogación se note. */
escenas.push([
  "01-dolor",
  `
  .marco { position: absolute; inset: 0; overflow: hidden; }
  .clip-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .velo { position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(180deg,
      rgba(11,17,32,.38) 0%, rgba(11,17,32,.58) 45%, rgba(11,17,32,.86) 100%); }
  .interrog { position: absolute; right: 132px; top: 470px; font-size: 300px;
    font-weight: 300; color: ${T.fg}; line-height: 1; opacity: 0; }
`,
  `    <div id="marco-01" class="marco">
      <video id="video-01" class="clip-video clip" src="assets/dolor-calculadora.mp4"
             data-start="0" data-duration="2.5" data-track-index="1" data-media-start="2"
             muted playsinline></video>
    </div>
    <div class="velo"></div>
    <div id="interrog-01" class="interrog">?</div>`,
  `
      // Un solo push, íntegro en la primera mitad (multi-phase-camera).
      tl.fromTo(q("#marco-01"), { scale: 1.06 }, { scale: 1.0, duration: 1.4, ease: "power3.out" }, 0);
      // 1.4–1.8s: quietud. Es el hueco que hace legible lo que viene.
      // El signo entra suave, sin rebasar (spring-pop-entrance, registro suave).
      tl.fromTo(q("#interrog-01"),
        { opacity: 0, scale: 0.86, y: 18 },
        { opacity: 0.5, scale: 1, y: 0, duration: 0.5, ease: "power3.out" }, 1.8);`,
]);

/* ── 02 · Solución ──────────────────────────────────────────────────────────
   La única escena donde se ve el producto funcionando. El argumento es la
   velocidad, así que el resultado aparece mientras se lee la frase. */
{
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];
  const grid = teclas
    .map((c, i) => `<div class="tecla" data-tecla="${c}" data-i="${i}">${c}</div>`)
    .join("\n        ");
  const frase = "Con La Tasa lo sabes en dos segundos"
    .split(" ")
    .map((p) => `<span class="pal${p === "dos" || p === "segundos" ? " clave" : ""}">${p}</span>`)
    .join(" ");

  escenas.push([
    "02-solucion",
    `
  .app { position: absolute; left: 80px; top: 300px; width: 920px; }
  .display { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px;
    padding: 34px 44px 38px; }
  .rot { font-size: 24px; color: ${T.muted}; letter-spacing: .07em; text-transform: uppercase; }
  .monto { font-size: 112px; font-weight: 600; line-height: 1; margin-top: 16px;
    display: flex; align-items: baseline; min-height: 112px; }
  .monto .d { display: inline-block; opacity: 0; }
  .monto .uni { font-weight: 400; font-size: 46px; color: ${T.muted}; margin-left: 18px; }
  .resultado { margin-top: 26px; border: 1px solid rgba(52,211,153,.4);
    background: rgba(52,211,153,.1); border-radius: 16px; padding: 30px 44px 34px; opacity: 0; }
  .resultado .cifra { font-size: 92px; font-weight: 600; color: ${T.accent}; line-height: 1;
    margin-top: 14px; display: flex; align-items: baseline; }
  .resultado .uni { font-weight: 400; font-size: 38px; color: ${T.muted}; margin-left: 18px; }
  .teclado { margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .tecla { height: 122px; border-radius: 12px; background: ${T.raised};
    border: 1px solid ${T.border}; display: flex; align-items: center; justify-content: center;
    font-size: 50px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .frase { position: absolute; left: 80px; right: 80px; top: 1498px; text-align: center;
    font-size: 44px; font-weight: 500; }
  .frase .pal { display: inline-block; opacity: 0; }
`,
    `    <span class="oculto-var" data-var-source="montoEjemplo" data-var-text="montoEjemplo">100</span>
    <span class="oculto-var" data-var-source="monedaOrigen" data-var-text="monedaOrigen">USD</span>
    <span class="oculto-var" data-var-source="monedaDestino" data-var-text="monedaDestino">COP</span>
    <span class="oculto-var" data-var-source="resultadoEjemplo" data-var-text="resultadoEjemplo">323.063</span>
    <div id="app-02" class="app">
      <div class="display">
        <div class="rot">Tienes</div>
        <div class="monto tabular"><span id="digitos-02"></span><span id="uni-origen-02" class="uni">USD</span></div>
      </div>
      <div id="resultado-02" class="resultado">
        <div class="rot">Equivale a</div>
        <div class="cifra tabular"><span id="cifra-02">323.063</span><span id="uni-destino-02" class="uni">COP</span></div>
      </div>
      <div class="teclado">
        ${grid}
      </div>
    </div>
    <div id="frase-02" class="frase">${frase}</div>`,
    `
      var monto = valorVar(raiz, "montoEjemplo", "100");
      q("#uni-origen-02").textContent = valorVar(raiz, "monedaOrigen", "USD");
      q("#uni-destino-02").textContent = valorVar(raiz, "monedaDestino", "COP");
      q("#cifra-02").textContent = valorVar(raiz, "resultadoEjemplo", "323.063");

      // Un span por dígito: es lo que permite escalonar el tecleo.
      var cont = q("#digitos-02");
      cont.textContent = "";
      var digitos = monto.split("").map(function (c) {
        var s = document.createElement("span");
        s.className = "d";
        s.textContent = c;
        cont.appendChild(s);
        return s;
      });

      // Scene 1: la app llega con el corte. 200 ms y ya está.
      tl.fromTo(q("#app-02"), { opacity: 0, scale: 0.985 },
        { opacity: 1, scale: 1, duration: 0.2, ease: "power3.out" }, 0);

      // Scene 2: se teclea dígito a dígito, 80 ms de separación
      // (dynamic-content-sequencing), y cada uno enciende su tecla.
      digitos.forEach(function (d, i) {
        var t0 = 0.2 + i * 0.08;
        tl.fromTo(d, { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.12, ease: "power3.out" }, t0);
        var tecla = qa('.tecla[data-tecla="' + d.textContent + '"]')[0];
        if (tecla) {
          // press-release-spring: compresión y recuperación, con el tinte de la app.
          tl.fromTo(tecla, { scale: 1 }, { scale: 0.95, duration: 0.06, ease: "power2.out" }, t0)
            .to(tecla, { scale: 1, duration: 0.16, ease: "power3.out" }, t0 + 0.06);
          tl.fromTo(tecla,
            { backgroundColor: "${T.raised}", borderColor: "${T.border}", color: "${T.fg}" },
            { backgroundColor: "rgba(52,211,153,0.2)", borderColor: "rgba(52,211,153,0.4)",
              color: "${T.accent}", duration: 0.06, ease: "power2.out" }, t0)
            .to(tecla, { backgroundColor: "${T.raised}", borderColor: "${T.border}",
              color: "${T.fg}", duration: 0.3, ease: "power3.out" }, t0 + 0.1);
        }
      });

      // Scene 3: el resultado aterriza en 2.90s global. Es el pago del plano.
      tl.fromTo(q("#resultado-02"), { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, 0.4);

      // Scene 4: la frase, palabra por palabra, desde 4.00s global.
      tl.fromTo(qa("#frase-02 .pal"), { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.26, ease: "power3.out", stagger: 0.055 }, 1.5);

      // Scene 5: revelado de la segunda mitad — lo que impide que el plano se congele.
      tl.fromTo(qa("#frase-02 .clave"), { color: "${T.fg}" },
        { color: "${T.accent}", duration: 0.22, ease: "power2.out" }, 2.4)
        .to(qa("#frase-02 .clave"), { color: "${T.fg}", duration: 0.5, ease: "power2.inOut" }, 2.75);
      tl.to(q("#resultado-02"), { scale: 1.02, duration: 0.2, ease: "power2.out" }, 2.4)
        .to(q("#resultado-02"), { scale: 1, duration: 0.36, ease: "power3.out" }, 2.6);

      // Scene 6: sostiene. Jitter de amplitud baja, finito, sin repeat.
      tl.to(q("#resultado-02"), { y: -2, duration: 0.3, ease: "sine.inOut" }, 2.96)
        .to(q("#resultado-02"), { y: 0, duration: 0.34, ease: "sine.inOut" }, 3.26);`,
  ]);
}

/* ── 03 · Dato-remate ───────────────────────────────────────────────────────
   La cifra protagonista de la pieza. Escalada según el board: casi a sangre,
   porque en el feed el video se ve a un tercio de este tamaño. */
{
  const sub = "de lo que pagas de más fuera del BCV"
    .split(" ")
    .map((p) => `<span class="pal">${p}</span>`)
    .join(" ");
  escenas.push([
    "03-brecha",
    `
  .bloom { position: absolute; left: 50%; top: 780px; width: 1000px; height: 1000px;
    margin-left: -500px; margin-top: -500px; border-radius: 50%; opacity: 0;
    background: radial-gradient(circle, rgba(52,211,153,.16) 0%, rgba(52,211,153,0) 68%); }
  .rot3 { position: absolute; left: 0; right: 0; top: 372px; text-align: center;
    font-size: 32px; color: ${T.muted}; letter-spacing: .14em; text-transform: uppercase;
    opacity: 0; }
  .tarjeta { position: absolute; left: 40px; top: 470px; width: 1000px;
    background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px;
    padding: 70px 50px 76px; opacity: 0; }
  .hero { font-size: 300px; font-weight: 700; color: ${T.accent}; line-height: .92;
    text-align: center; letter-spacing: -.03em; }
  .sub { margin-top: 52px; font-size: 46px; color: ${T.muted}; text-align: center;
    line-height: 1.32; }
  .sub .pal { display: inline-block; opacity: 0; }
`,
    `    <span class="oculto-var" data-var-source="brechaPorcentaje" data-var-text="brechaPorcentaje">16,4%</span>
    <div id="bloom-03" class="bloom"></div>
    <div id="rot-03" class="rot3">La brecha de hoy</div>
    <div id="tarjeta-03" class="tarjeta">
      <div id="hero-03" class="hero tabular">16,4%</div>
      <div id="sub-03" class="sub">${sub}</div>
    </div>`,
    `
      var destino = valorVar(raiz, "brechaPorcentaje", "16,4%");
      // Se separa el número del resto (el "%") para poder contarlo y devolver
      // al final exactamente la cadena de la variable, con su coma decimal.
      var m = destino.match(/-?[\\d.,]+/);
      var crudo = m ? m[0] : "16,4";
      var sufijo = destino.slice((m ? m.index : 0) + crudo.length);
      var objetivo = parseFloat(crudo.replace(/\\./g, "").replace(",", ".")) || 0;
      var decimales = (crudo.split(",")[1] || "").length;
      var hero = q("#hero-03");
      var estado = { v: 0 };
      function pintar() {
        hero.textContent = estado.v.toFixed(decimales).replace(".", ",") + sufijo;
      }
      pintar();

      // Scene 1: solo el rótulo. La tarjeta todavía no existe.
      tl.fromTo(q("#rot-03"), { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 0);

      // Scene 2: quietud bajo el riser. Lo único que evoluciona es el bloom.
      tl.fromTo(q("#bloom-03"), { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 1.5, ease: "power2.inOut" }, 0.5);

      // Scene 3: impacto en 8.0s global. La tarjeta aterriza y el contador arranca.
      tl.fromTo(q("#tarjeta-03"), { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.4, ease: "power3.out" }, 2.0);
      // counting-dynamic-scale: la cifra crece mientras sube, así la subida se siente.
      tl.fromTo(hero, { scale: 0.82 }, { scale: 1, duration: 0.4, ease: "power3.out" }, 2.0);
      tl.to(estado, { v: objetivo, duration: 0.4, ease: "power2.out", onUpdate: pintar }, 2.0);

      // Scene 4: revelado de la segunda mitad, palabra por palabra.
      tl.fromTo(qa("#sub-03 .pal"), { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.24, ease: "power3.out", stagger: 0.05 }, 2.4);

      // Scene 5: un solo realce sobre la cifra y a sostener. Sin semáforo de color.
      tl.to(hero, { scale: 1.03, duration: 0.18, ease: "power2.out" }, 3.05)
        .to(hero, { scale: 1, duration: 0.3, ease: "power3.out" }, 3.23);`,
  ]);
}

/* ── 04 · Bisagra ───────────────────────────────────────────────────────────
   Un segundo. Un movimiento por elemento y nada más. El logo aterriza en la
   posición exacta que heredan las escenas 5 y 6. */
escenas.push([
  "04-bisagra",
  `
  .logo { position: absolute; left: 120px; top: 150px; width: 130px; height: 130px;
    border-radius: 32px; opacity: 0; }
  .logo img { width: 100%; height: 100%; display: block; border-radius: 32px; }
  .gratis { position: absolute; left: 0; right: 0; top: 760px; text-align: center;
    font-size: 260px; font-weight: 700; color: ${T.accent}; line-height: 1;
    letter-spacing: -.035em; opacity: 0; }
`,
  `    <div id="logo-04" class="logo"><img src="assets/logo-latasa.png" alt=""></div>
    <div id="gratis-04" class="gratis">Gratis.</div>`,
  `
      // Scene 1: el logo entra desde fuera de cuadro a su esquina definitiva.
      tl.fromTo(q("#logo-04"), { opacity: 0, x: -260 },
        { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, 0);
      // Scene 2: solapa 50 ms con la anterior para que el plano tenga un solo arranque.
      tl.fromTo(q("#gratis-04"), { opacity: 0, y: 40, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }, 0.22);
      // Scene 3: quietud hasta el corte. El logo queda en 120/150, escala 1, opacidad 1.`,
]);

/* ── 05 · Instagram ─────────────────────────────────────────────────────────
   El gesto es el mensaje: se muestra el dedo pulsando «Seguir», que es la
   acción que este anuncio compra. El logo NO entra: ya venía puesto. */
{
  const frase = "Cada mañana y cada tarde, tasas nuevas en Instagram"
    .split(" ")
    .map((p) => `<span class="pal">${p}</span>`)
    .join(" ");
  escenas.push([
    "05-instagram",
    `
  .logo { position: absolute; left: 120px; top: 150px; width: 130px; height: 130px; }
  .logo img { width: 100%; height: 100%; display: block; border-radius: 32px; }
  .pila { position: absolute; left: 140px; top: 400px; width: 800px; height: 780px; }
  .post { position: absolute; left: 0; width: 800px; border-radius: 16px;
    background: ${T.surface}; border: 1px solid ${T.border}; opacity: 0; }
  .post.c { top: 130px; height: 620px; transform: scale(.88); opacity: 0; }
  .post.b { top: 66px;  height: 630px; transform: scale(.94); opacity: 0; }
  .post.a { top: 0; height: 640px; overflow: hidden; }
  .cab { height: 100px; border-bottom: 1px solid ${T.border};
    display: flex; align-items: center; gap: 20px; padding: 0 26px; }
  .av { width: 58px; height: 58px; border-radius: 50%; overflow: hidden; flex: none; }
  .av img { width: 100%; height: 100%; display: block; }
  .nm { font-size: 27px; font-weight: 500; }
  .seguir { margin-left: auto; padding: 15px 36px; border-radius: 9999px;
    background: ${T.accent}; color: ${T.bg}; font-size: 25px; font-weight: 600; }
  .tarjeta-post { margin: 26px; border-radius: 12px; background: ${T.bg};
    border: 1px solid ${T.border}; padding: 26px 30px; }
  .tp-rot { font-size: 21px; color: ${T.muted}; letter-spacing: .1em; text-transform: uppercase; }
  .fila { display: flex; justify-content: space-between; align-items: baseline;
    padding: 17px 0; border-bottom: 1px solid ${T.border}; }
  .fila:last-child { border-bottom: 0; }
  .fila .lbl { font-size: 25px; }
  .fila .val { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .fila .val em { font-style: normal; font-weight: 400; font-size: 21px; color: ${T.muted}; margin-left: 8px; }
  /* La punta cae en la esquina inferior derecha del botón: toca el objetivo sin
     taparle la etiqueta, que está centrada más a la izquierda. */
  .mano { position: absolute; ${manoEn(880, 455)} opacity: 0; }
  .onda { position: absolute; left: 880px; top: 455px; width: 20px; height: 20px;
    margin: -10px 0 0 -10px; border-radius: 50%; border: 3px solid ${T.accent}; opacity: 0; }
  .frase { position: absolute; left: 80px; right: 80px; top: 1318px; text-align: center;
    font-size: 42px; font-weight: 500; line-height: 1.34; }
  .frase .pal { display: inline-block; opacity: 0; }
  .handle { position: absolute; left: 0; right: 0; top: 1466px; text-align: center;
    font-size: 46px; font-weight: 600; color: ${T.accent}; opacity: 0; }
`,
    `    <span class="oculto-var" data-var-source="handleInstagram" data-var-text="handleInstagram">@latasa.online</span>
    <div class="logo"><img src="assets/logo-latasa.png" alt=""></div>
    <div class="pila">
      <div id="post-c-05" class="post c"></div>
      <div id="post-b-05" class="post b"></div>
      <div id="post-a-05" class="post a">
        <div class="cab">
          <div class="av"><img src="assets/logo-avatar.png" alt=""></div>
          <div class="nm">latasa.online</div>
          <div id="seguir-05" class="seguir">Seguir</div>
        </div>
        <div class="tarjeta-post">
          <div class="tp-rot">Tasas de hoy</div>
          <div class="fila"><span class="lbl">Dólar BCV</span><span class="val">784,66<em>Bs</em></span></div>
          <div class="fila"><span class="lbl">Binance venta</span><span class="val">913,50<em>Bs</em></span></div>
          <div class="fila"><span class="lbl">Peso Binance</span><span class="val">0,2328<em>Bs</em></span></div>
        </div>
      </div>
    </div>
    ${manoSvg("mano-05")}
    <div id="onda-05" class="onda"></div>
    <div id="frase-05" class="frase">${frase}</div>
    <div id="handle-05" class="handle">@latasa.online</div>`,
    `
      q("#handle-05").textContent = valorVar(raiz, "handleInstagram", "@latasa.online");

      // Scene 1: la pila entra desde abajo, de atrás hacia delante.
      tl.fromTo(q("#post-c-05"), { opacity: 0, y: 70 },
        { opacity: .3, y: 0, duration: 0.3, ease: "power3.out" }, 0);
      tl.fromTo(q("#post-b-05"), { opacity: 0, y: 70 },
        { opacity: .55, y: 0, duration: 0.3, ease: "power3.out" }, 0.07);
      tl.fromTo(q("#post-a-05"), { opacity: 0, y: 70 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, 0.14);

      // Scene 2: el dedo entra desde fuera del cuadro por abajo a la derecha. Se
      // parte en dos tramos con eases opuestos para que la trayectoria describa
      // una curva en vez de una recta, que es como se mueve una mano de verdad.
      tl.fromTo(q("#mano-05"), { opacity: 0, x: 190, y: 560 },
        { opacity: 1, x: 46, y: 140, duration: 0.3, ease: "power2.out" }, 0.3)
        .to(q("#mano-05"), { x: 0, y: 0, duration: 0.15, ease: "power3.in" }, 0.6);

      // Scene 3: el toque. Botón y dedo se comprimen juntos (press-release-spring).
      tl.to(q("#mano-05"), { scale: 0.94, duration: 0.07, ease: "power2.out" }, 0.75)
        .to(q("#mano-05"), { scale: 1, duration: 0.16, ease: "power3.out" }, 0.82);
      tl.to(q("#seguir-05"), { scale: 0.93, duration: 0.07, ease: "power2.out" }, 0.75)
        .to(q("#seguir-05"), { scale: 1, duration: 0.16, ease: "power3.out" }, 0.82);
      // La onda del cursor-click-ripple: finita, sin repeat.
      tl.fromTo(q("#onda-05"), { opacity: .8, scale: 1 },
        { opacity: 0, scale: 9, duration: 0.5, ease: "power2.out",
          immediateRender: false }, 0.78);
      // hard-cut word swap: el cambio de estado es el beat, sin fundido.
      tl.call(function () { q("#seguir-05").textContent = "Siguiendo"; }, null, 0.82);

      // Scene 4: revelado de la segunda mitad.
      tl.fromTo(qa("#frase-05 .pal"), { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.22, ease: "power3.out", stagger: 0.034 }, 0.92);
      tl.fromTo(q("#handle-05"), { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.26, ease: "power3.out" }, 1.20);`,
  ]);
}

/* ── 06 · WhatsApp ──────────────────────────────────────────────────────────
   Misma gramática que la 5. El logo sigue inmóvil: el viaje al centro lo hace
   la escena 7, porque una salida aquí quedaría cortada por el corte. */
{
  const frase = "Y el canal de WhatsApp, directo a tu chat"
    .split(" ")
    .map((p) => `<span class="pal">${p}</span>`)
    .join(" ");
  escenas.push([
    "06-whatsapp",
    `
  .logo { position: absolute; left: 120px; top: 150px; width: 130px; height: 130px; }
  .logo img { width: 100%; height: 100%; display: block; border-radius: 32px; }
  .canal { position: absolute; left: 140px; top: 400px; width: 800px;
    background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px;
    overflow: hidden; opacity: 0; }
  .cab { height: 132px; display: flex; align-items: center; gap: 22px; padding: 0 30px;
    border-bottom: 1px solid ${T.border}; }
  .av { width: 76px; height: 76px; border-radius: 50%; overflow: hidden; flex: none; }
  .av img { width: 100%; height: 100%; display: block; }
  .nm { font-size: 31px; font-weight: 600; }
  .sub { font-size: 22px; color: ${T.muted}; margin-top: 5px; }
  .burbuja { margin: 30px; padding: 26px 30px; border-radius: 16px; background: ${T.raised};
    border: 1px solid ${T.border}; font-size: 26px; color: ${T.muted}; line-height: 1.5;
    opacity: 0; }
  .burbuja b { color: ${T.fg}; font-weight: 600; display: block; margin-bottom: 8px;
    letter-spacing: .06em; }
  .burbuja .lin { display: flex; justify-content: space-between; padding: 5px 0;
    font-variant-numeric: tabular-nums; }
  .burbuja .lin span:last-child { color: ${T.fg}; font-weight: 600; }
  .unirse { margin: 0 30px 30px; height: 106px; border-radius: 9999px; background: ${T.accent};
    color: ${T.bg}; font-size: 33px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; }
  .mano { position: absolute; ${manoEn(760, 848)} opacity: 0; }
  .onda { position: absolute; left: 760px; top: 848px; width: 20px; height: 20px;
    margin: -10px 0 0 -10px; border-radius: 50%; border: 3px solid ${T.accent}; opacity: 0; }
  .frase { position: absolute; left: 80px; right: 80px; top: 1390px; text-align: center;
    font-size: 42px; font-weight: 500; line-height: 1.34; }
  .frase .pal { display: inline-block; opacity: 0; }
`,
    `    <div class="logo"><img src="assets/logo-latasa.png" alt=""></div>
    <div id="canal-06" class="canal">
      <div class="cab">
        <div class="av"><img src="assets/logo-avatar.png" alt=""></div>
        <div>
          <div class="nm">La Tasa</div>
          <div class="sub">Canal · Tasas del día</div>
        </div>
      </div>
      <div id="burbuja-06" class="burbuja">
        <b>TASAS DE HOY</b>
        <div class="lin"><span>Dólar BCV</span><span>784,66 Bs</span></div>
        <div class="lin"><span>Binance venta</span><span>913,50 Bs</span></div>
      </div>
      <div id="unirse-06" class="unirse">Unirse al canal</div>
    </div>
    ${manoSvg("mano-06")}
    <div id="onda-06" class="onda"></div>
    <div id="frase-06" class="frase">${frase}</div>`,
    `
      // Scene 1: la tarjeta del canal entra desde abajo.
      tl.fromTo(q("#canal-06"), { opacity: 0, y: 60 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, 0);

      // Scene 2: la burbuja cae después que su contenedor, que es el orden real.
      tl.fromTo(q("#burbuja-06"), { opacity: 0, y: 26, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" }, 0.3);

      // Scene 3: el dedo llega al botón y lo pulsa.
      tl.fromTo(q("#mano-06"), { opacity: 0, x: 160, y: 520 },
        { opacity: 1, x: 38, y: 130, duration: 0.28, ease: "power2.out" }, 0.6)
        .to(q("#mano-06"), { x: 0, y: 0, duration: 0.14, ease: "power3.in" }, 0.86);
      tl.to(q("#mano-06"), { scale: 0.94, duration: 0.07, ease: "power2.out" }, 1.0)
        .to(q("#mano-06"), { scale: 1, duration: 0.16, ease: "power3.out" }, 1.07);
      tl.to(q("#unirse-06"), { scale: 0.95, duration: 0.07, ease: "power2.out" }, 1.0)
        .to(q("#unirse-06"), { scale: 1, duration: 0.16, ease: "power3.out" }, 1.07);
      tl.fromTo(q("#onda-06"), { opacity: .8, scale: 1 },
        { opacity: 0, scale: 9, duration: 0.45, ease: "power2.out",
          immediateRender: false }, 1.02);
      tl.call(function () { q("#unirse-06").textContent = "Te uniste"; }, null, 1.07);

      // Scene 4: revelado de la segunda mitad.
      tl.fromTo(qa("#frase-06 .pal"), { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.22, ease: "power3.out", stagger: 0.030 }, 1.00);`,
  ]);
}

/* ── 07 · Cierre ────────────────────────────────────────────────────────────
   Única escena con derecho a asentamiento de salida. Recoge el logo desde la
   esquina exacta en que lo dejó la 6 y lo lleva al centro. */
{
  const frase = "Síguenos. Únete."
    .split(" ")
    .map((p) => `<span class="pal">${p}</span>`)
    .join(" ");
  const marca = "La Tasa"
    .split("")
    .map((c) => `<span class="ch">${c === " " ? "&nbsp;" : c}</span>`)
    .join("");
  escenas.push([
    "07-cierre",
    `
  /* Arranca en la esquina de la escena 6 y viaja al centro: el desplazamiento
     está calculado desde 120/150 hasta el centro horizontal en y 560. */
  .logo { position: absolute; left: 120px; top: 150px; width: 130px; height: 130px;
    transform-origin: 50% 50%; }
  .logo img { width: 100%; height: 100%; display: block; border-radius: 32px; }
  .marca { position: absolute; left: 0; right: 0; top: 852px; text-align: center;
    font-size: 104px; font-weight: 700; letter-spacing: -.025em; }
  .marca .ch { display: inline-block; opacity: 0; }
  .handle { position: absolute; left: 0; right: 0; top: 1000px; text-align: center;
    font-size: 50px; font-weight: 600; color: ${T.accent}; opacity: 0; }
  .wa { position: absolute; left: 50%; top: 1108px; width: 108px; height: 108px;
    margin-left: -54px; border-radius: 50%; background: ${T.surface};
    border: 1px solid ${T.border}; display: flex; align-items: center; justify-content: center;
    opacity: 0; }
  .wa svg { width: 58px; height: 58px; }
  .frase { position: absolute; left: 0; right: 0; top: 1310px; text-align: center;
    font-size: 48px; font-weight: 500; color: ${T.muted}; }
  .frase .pal { display: inline-block; opacity: 0; }
`,
    `    <span class="oculto-var" data-var-source="handleInstagram" data-var-text="handleInstagram">@latasa.online</span>
    <div id="logo-07" class="logo"><img src="assets/logo-latasa.png" alt=""></div>
    <div id="marca-07" class="marca">${marca}</div>
    <div id="handle-07" class="handle">@latasa.online</div>
    <div id="wa-07" class="wa">
      <svg viewBox="0 0 24 24" fill="${T.accent}" aria-hidden="true">
        <path d="M12.04 2A9.9 9.9 0 0 0 2.1 11.9c0 1.75.46 3.46 1.34 4.97L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01a9.9 9.9 0 0 0 9.93-9.9A9.9 9.9 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.38 8.24 8.24 0 1 1 8.25 8.25Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.24-.02-.38.1-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.09-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.85.84-.85 2.03s.87 2.36 1 2.52c.12.16 1.71 2.6 4.14 3.65.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.29Z"/>
      </svg>
    </div>
    <div id="frase-07" class="frase">${frase}</div>`,
    `
      q("#handle-07").textContent = valorVar(raiz, "handleInstagram", "@latasa.online");

      // Scene 1: el logo viaja de la esquina al centro y crece.
      // El desplazamiento se calcula, no se escribe a mano, para que siga siendo
      // correcto si cambia el tamaño del logo o el lienzo.
      var LADO = 130, DESTINO_Y = 560, ESCALA = 2.6;
      var dx = (1080 - LADO) / 2 - 120;
      var dy = DESTINO_Y - 150;
      tl.fromTo(q("#logo-07"),
        { x: 0, y: 0, scale: 1 },
        { x: dx, y: dy, scale: ESCALA, duration: 0.55, ease: "power3.out" }, 0);

      // Scene 2: la marca se arma letra a letra, solapando el final del viaje.
      tl.fromTo(qa("#marca-07 .ch"), { opacity: 0, y: 26 },
        { opacity: 1, y: 0, duration: 0.24, ease: "power3.out", stagger: 0.035 }, 0.45);

      // Scene 3: handle e ícono, escalonados.
      tl.fromTo(q("#handle-07"), { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.26, ease: "power3.out" }, 0.75);
      tl.fromTo(q("#wa-07"), { opacity: 0, y: 16, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power3.out" }, 0.84);

      // Scene 4: el cierre, palabra por palabra, y todo queda inmóvil.
      tl.fromTo(qa("#frase-07 .pal"), { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.26, ease: "power3.out", stagger: 0.09 }, 1.05);`,
  ]);
}

for (const [id, css, cuerpo, js] of escenas) {
  writeFileSync(join(DESTINO, `${id}.html`), envolver(id, css, cuerpo, js), "utf8");
  console.log("escena:", `compositions/frames/${id}.html`);
}
console.log(`\n${escenas.length} escenas animadas escritas.`);
