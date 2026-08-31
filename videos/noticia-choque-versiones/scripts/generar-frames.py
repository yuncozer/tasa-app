# -*- coding: utf-8 -*-
"""Genera los 11 frames del video del choque de versiones.

Existe por un motivo concreto: la mitad de cada archivo es identica en los once
(la @font-face, el #root, el suelo y el lockup de marca), y mantenerla a mano en
once copias es como se cuelan las divergencias. Aqui se escribe una vez.

Lo que SI es propio de cada frame -contenido, layout y coreografia- vive abajo,
en FRAMES, uno por entrada. El generador no decide nada de diseno.

    python scripts/generar-frames.py
"""
import io
import os

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SALIDA = os.path.join(RAIZ, 'compositions', 'frames')

# Tokens de La Tasa (ESTILOS.md §2). --warning #fbbf24 no se usa: aqui seria
# decorativo y en ese sistema es semantico.
BG, SURFACE, FG, MUTED, BORDE, ACENTO = (
    '#0b1120', '#131c2f', '#f1f5f9', '#94a3b8', '#26324c', '#34d399')

CSS_BASE = '''    @font-face {{ font-family: "Geist Sans"; src: url("assets/fonts/geist-latin.woff2") format("woff2");
      font-weight: 100 900; font-style: normal; font-display: block; }}

    #root {{ width: 1080px; height: 1920px; position: relative; overflow: hidden;
      container-type: size; font-family: "Geist Sans", sans-serif; color: {fg};
      -webkit-font-smoothing: antialiased; }}

    .suelo {{ position: absolute; inset: 0; background: {bg}; }}
    .contenido {{ position: absolute; inset: 0; }}
    .tabular {{ font-variant-numeric: tabular-nums; }}

    .marco {{ position: absolute; inset: 0; overflow: hidden; }}
    .foto {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}
    .velo {{ position: absolute; inset: 0; pointer-events: none; }}

    .kicker {{ position: absolute; top: 116px; left: 60px; font-weight: 500; font-size: 26px;
      letter-spacing: 0.14em; text-transform: uppercase; color: {ac}; }}
    .hairline {{ position: absolute; left: 60px; width: 960px; height: 1px;
      background: {borde}; transform-origin: left center; }}

    /* La marca va en las once pantallas, arriba a la derecha: si alguien descarga
       el Reel y lo reparte suelto, la cuenta viaja con el. */
    .marca {{ position: absolute; top: 104px; right: 60px;
      display: flex; align-items: center; gap: 16px; }}
    .marca-logo {{ width: 60px; height: 60px; border-radius: 14px; display: block; }}
    .marca-nombre {{ font-weight: 600; font-size: 38px; letter-spacing: -0.02em;
      line-height: 1; color: {fg}; }}
'''.format(fg=FG, bg=BG, ac=ACENTO, borde=BORDE)

MARCA_HTML = '''      <div class="marca">
        <img class="marca-logo" src="assets/logo-latasa.png" alt="" />
        <span class="marca-nombre">La Tasa</span>
      </div>'''

PLANTILLA = '''<template>
  <div id="root" data-composition-id="{cid}" data-start="0" data-duration="{dur}"
       data-width="1080" data-height="1920">

    <div id="suelo-{cid}" class="clip suelo" data-start="0" data-duration="{dur}" data-track-index="0"></div>

    <div id="contenido-{cid}" class="clip contenido" data-start="0" data-duration="{dur}" data-track-index="1">
{html}
{marca}
    </div>
  </div>

  <style>
{css_base}{css}  </style>

  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script>
    (function () {{
      var raiz = document.currentScript.parentNode.querySelector('[data-composition-id="{cid}"]')
        || document.querySelector('[data-composition-id="{cid}"]');
      var q = function (sel) {{ return raiz.querySelector(sel); }};
      var qa = function (sel) {{ return Array.prototype.slice.call(raiz.querySelectorAll(sel)); }};

      window.__timelines = window.__timelines || {{}};
      var tl = gsap.timeline({{ paused: true }});
      window.__timelines["{cid}"] = tl;

      // Identidad, no elemento narrativo: entra con el frame y no compite.
      tl.fromTo(q(".marca"), {{ opacity: 0, y: -10 }},
        {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, 0.02);

{js}    }})();
  </script>
</template>
'''


def foto(src, pos, filtro, velo):
    return '''      <div class="marco">
        <img id="foto" class="foto" src="public/fotos/%s" alt="" data-layout-allow-overflow />
      </div>
      <div class="velo"></div>
''' % src, '''    .foto { object-position: %s; filter: %s; }
    .velo { background: %s; }
''' % (pos, filtro, velo)


FRAMES = []


def frame(cid, dur, html, css, js):
    FRAMES.append((cid, dur, html, css, js))


# ---------------------------------------------------------------- 01 gancho
h, c = foto('portada-cara-a-cara.png', '50% 42%', 'saturate(0.50) contrast(1.05) brightness(0.72)',
            'linear-gradient(180deg, rgba(11,17,32,.46) 0%, rgba(11,17,32,.20) 20%, '
            'rgba(11,17,32,.34) 44%, rgba(11,17,32,.78) 58%, rgba(11,17,32,.93) 74%, '
            'rgba(11,17,32,.97) 100%)')
frame('01-gancho', '4.0', h + '''
      <div class="kicker">ACUERDO EE.UU. &ndash; VENEZUELA</div>

      <div class="titular">
        <div id="l1" class="linea" data-layout-allow-overlap>&iquest;Negocio millonario</div>
        <div id="l2" class="linea acento" data-layout-allow-overlap>o &laquo;un regalo&raquo;?</div>
      </div>

      <div class="sub">
        <div id="s1" class="sub-linea">El choque de versiones entre Trump y</div>
        <div id="s2" class="sub-linea">Venezuela por el &laquo;acuerdo del siglo&raquo;.</div>
      </div>''', c + '''    .titular { position: absolute; left: 60px; right: 60px; top: 1088px; }
    .linea { font-weight: 900; font-size: 94px; line-height: 1.0; letter-spacing: -0.04em; }
    .acento { color: %s; }
    .sub { position: absolute; left: 60px; right: 60px; top: 1318px; }
    .sub-linea { font-weight: 400; font-size: 50px; line-height: 1.32; color: %s; }
''' % (ACENTO, FG), '''      // El push abre lento sobre los tres retratos y cierra sobre el pozo.
      tl.fromTo(q(".marco"), { scale: 1.10 }, { scale: 1.03, duration: 2.4, ease: "power3.out" }, 0);
      tl.to(q(".marco"), { scale: 1.06, duration: 1.6, ease: "none" }, 2.4);
      tl.fromTo(q(".kicker"), { opacity: 0, y: -14 },
        { opacity: 1, y: 0, duration: 0.38, ease: "power3.out" }, 0.16);

      // kinetic-beat-slam: dos golpes sobre una rejilla. La pregunta completa
      // aterriza antes del segundo 1,5 — el gancho no puede depender de que el
      // lector aguante hasta el final del frame.
      var P = 0.32;
      tl.fromTo(q("#l1"), { scale: 1.30, filter: "blur(14px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.5, ease: "power4.out" }, P * 1.1);
      tl.fromTo(q("#l2"), { y: 84, rotation: 3, opacity: 0 },
        { y: 0, rotation: 0, opacity: 1, duration: 0.46, ease: "circ.out" }, P * 3.0);

      // El subtitulo cae linea a linea: primero engancha, despues explica.
      tl.fromTo(q("#s1"), { opacity: 0, y: 26 },
        { opacity: 1, y: 0, duration: 0.36, ease: "power3.out" }, 1.70);
      tl.fromTo(q("#s2"), { opacity: 0, y: 26 },
        { opacity: 1, y: 0, duration: 0.36, ease: "power3.out" }, 1.86);
''')

# ---------------------------------------------------------------- 02 puente
h, c = foto('portada-cara-a-cara.png', '50% 42%', 'saturate(0.30) contrast(1.05) brightness(0.44)',
            'linear-gradient(180deg, rgba(11,17,32,.74) 0%, rgba(11,17,32,.64) 30%, '
            'rgba(11,17,32,.93) 62%, rgba(11,17,32,.99) 100%)')
frame('02-puente', '2.2', h + '''
      <div class="bloque">
        <div id="l1" class="linea" data-layout-allow-overlap>Dos versiones</div>
        <div id="l2" class="linea acento" data-layout-allow-overlap>del mismo acuerdo</div>
      </div>

      <div class="marcas"><div class="mk"></div><div class="mk"></div></div>''',
      c + '''    .bloque { position: absolute; left: 60px; right: 60px; top: 852px; }
    .linea { font-weight: 900; font-size: 104px; line-height: 1.0; letter-spacing: -0.045em; }
    .acento { color: %s; }
    .marcas { position: absolute; left: 60px; top: 1108px; display: flex; gap: 20px; }
    .mk { width: 120px; height: 6px; background: %s; transform-origin: left center; }
''' % (ACENTO, ACENTO), '''      // El push no se reinicia: continua donde lo dejo el gancho.
      tl.fromTo(q("#foto"), { scale: 1.06 }, { scale: 1.10, duration: 2.2, ease: "none" }, 0);

      // Frame puente: el mas corto del video. Es una respiracion entre el gancho
      // y las dos versiones, no un frame de informacion — por eso no hay nada
      // que leer despacio.
      tl.fromTo(q("#l1"), { scale: 1.20, filter: "blur(12px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.40, ease: "power4.out" }, 0.06);
      tl.fromTo(q("#l2"), { y: 66, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.38, ease: "circ.out" }, 0.34);
      // Dos marcas, no tres: son dos versiones.
      tl.fromTo(qa(".mk"), { scaleX: 0 },
        { scaleX: 1, duration: 0.28, stagger: 0.12, ease: "power3.out" }, 0.74);
''')

# ------------------------------------------------------------ 03 cita Trump
# La portada recortada a la derecha: es donde esta Trump. El mismo cuadro sirve
# para las dos versiones cambiando el encuadre, y eso refuerza el argumento.
h, c = foto('trump.jpg', '50% 30%', 'grayscale(1) contrast(1.15) brightness(0.62) blur(20px)',
            'linear-gradient(180deg, rgba(11,17,32,.58) 0%, rgba(11,17,32,.40) 24%, '
            'rgba(11,17,32,.86) 52%, rgba(11,17,32,.97) 100%)')
frame('03-trump-cita', '5.0', h + '''
      <div class="kicker">LO QUE DIJO TRUMP</div>

      <div class="cita">
        <div id="c1" class="cita-linea acento" data-layout-allow-overlap>&laquo;Un regalo</div>
        <div id="c2" class="cita-linea acento" data-layout-allow-overlap>de Venezuela</div>
        <div id="c3" class="cita-linea acento" data-layout-allow-overlap>al pueblo</div>
        <div id="c4" class="cita-linea acento" data-layout-allow-overlap>de EE.UU.&raquo;</div>
      </div>

      <div id="hl" class="hairline" style="top: 1322px"></div>
      <div id="fuente" class="fuente">Truth Social, 30 de agosto.</div>''',
      c + '''    .cita { position: absolute; left: 60px; right: 60px; top: 872px; }
    .cita-linea { font-weight: 900; font-size: 96px; line-height: 1.04; letter-spacing: -0.04em; }
    .acento { color: %s; }
    .fuente { position: absolute; left: 60px; right: 60px; top: 1368px;
      font-weight: 400; font-size: 42px; line-height: 1.36; color: %s; }
''' % (ACENTO, MUTED), '''      // La escala extra tapa el borde que deja el blur al desenfocar hasta el
      // limite del lienzo.
      tl.fromTo(q("#foto"), { scale: 1.26 },
        { scale: 1.16, duration: 3.0, ease: "power3.out" }, 0);
      tl.to(q("#foto"), { scale: 1.20, duration: 2.0, ease: "none" }, 3.0);
      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.06);

      // La cita se arma delante del lector, linea a linea. Es la frase entera
      // la que choca, no una palabra: por eso ninguna se destaca sobre otra.
      tl.fromTo(q("#c1"), { scale: 1.20, filter: "blur(12px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.46, ease: "power4.out" }, 0.30);
      tl.fromTo(q("#c2"), { x: -220, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.42, ease: "expo.out" }, 0.88);
      tl.fromTo(q("#c3"), { y: 66, rotation: 2, opacity: 0 },
        { y: 0, rotation: 0, opacity: 1, duration: 0.46, ease: "circ.out" }, 1.46);
      tl.fromTo(q("#c4"), { y: 66, rotation: 2, opacity: 0 },
        { y: 0, rotation: 0, opacity: 1, duration: 0.46, ease: "circ.out" }, 1.74);

      // La fuente llega ultima: primero se lee la cita, despues quien la dijo.
      tl.fromTo(q("#hl"), { scaleX: 0 },
        { scaleX: 1, duration: 0.46, ease: "power3.inOut" }, 2.20);
      tl.fromTo(q("#fuente"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 2.46);
''')

# ------------------------------------------------------------ 04 publicacion
# El post real como prueba. La captura que circula es de una cuenta de
# comentarios que reproduce Truth Social, asi que se recorta al SEGUNDO cuadro
# -el post original de @realDonaldTrump, con su hora- y se deja fuera el chrome
# de la cuenta intermediaria: lo que se ensena tiene que ser la fuente, no quien
# la reenvia.
#
# Recorte: la tarjeta blanca ocupa x 195..1285 e y 800..1560 de una imagen de
# 1320x1676. Escalada a 900px de ancho, el factor es 900/1090 = 0.8257.
h, c = foto('trump.jpg', '50% 30%',
            'grayscale(1) contrast(1.12) brightness(0.5) blur(26px)',
            'linear-gradient(180deg, rgba(11,17,32,.66) 0%, rgba(11,17,32,.58) 40%, '
            'rgba(11,17,32,.94) 100%)')
frame('04-publicacion', '5.0', h + '''
      <div class="kicker">SU PUBLICACI&Oacute;N DE ESTA MA&Ntilde;ANA</div>

      <div id="tarjeta" class="tarjeta">
        <img class="tarjeta-img" src="public/fotos/post-trump.jpg" alt=""
             data-layout-allow-overflow />
      </div>
      <div id="pie-tarjeta" class="pie-tarjeta">Truth Social &middot; 30 de agosto, 10:10 a. m.</div>

      <div class="bloque">
        <div id="t1" class="linea" data-layout-allow-overlap>Llenar las</div>
        <div id="t2" class="linea acento" data-layout-allow-overlap>Reservas Estrat&eacute;gicas</div>
      </div>

      <div id="nota" class="nota">Dice que quedaron casi vac&iacute;as con Biden.</div>''',
      c + '''    .tarjeta { position: absolute; left: 90px; top: 236px; width: 900px; height: 628px;
      overflow: hidden; border-radius: 20px; border: 1px solid %s; }
    .tarjeta-img { position: absolute; left: -161px; top: -661px; width: 1090px; height: auto;
      display: block; }
    .pie-tarjeta { position: absolute; left: 90px; top: 888px; font-weight: 500; font-size: 25px;
      letter-spacing: 0.12em; text-transform: uppercase; color: %s; }

    .bloque { position: absolute; left: 60px; right: 60px; top: 1010px; }
    .linea { font-weight: 900; font-size: 88px; line-height: 1.06; letter-spacing: -0.04em; }
    .acento { color: %s; }
    .nota { position: absolute; left: 60px; right: 60px; top: 1268px;
      font-weight: 400; font-size: 42px; line-height: 1.36; color: %s; }
''' % (BORDE, MUTED, ACENTO, MUTED), '''      tl.fromTo(q("#foto"), { scale: 1.28 },
        { scale: 1.18, duration: 3.2, ease: "power3.out" }, 0);
      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.06);

      // La tarjeta es el protagonista: es el documento. Entra entera y de una,
      // sin trocear, porque una captura que se arma por partes deja de leerse
      // como captura.
      tl.fromTo(q("#tarjeta"), { y: 46, scale: 0.94, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.52, ease: "power4.out" }, 0.22);
      tl.fromTo(q("#pie-tarjeta"), { opacity: 0 },
        { opacity: 1, duration: 0.32, ease: "power2.out" }, 0.74);

      // El titular traduce lo que el post dice, para quien no lee ingles.
      tl.fromTo(q("#t1"), { scale: 1.14, filter: "blur(10px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.44, ease: "power4.out" }, 1.30);
      tl.fromTo(q("#t2"), { x: -180, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.42, ease: "expo.out" }, 1.76);

      // "Dice que" no es adorno: lo de Biden es afirmacion suya, no dato.
      tl.fromTo(q("#nota"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 2.46);
''')

# ---------------------------------------------------------------- 05 pivote
frame('05-pivote', '3.2', '''
      <div class="kicker">SU ALOCUCI&Oacute;N</div>

      <div id="banda" class="banda">
        <img class="banda-img" src="public/fotos/delcy-alocucion.webp" alt=""
             data-layout-allow-overflow />
      </div>
      <div id="pie-banda" class="pie-banda">DELCY RODR&Iacute;GUEZ, EN EL CANAL DEL ESTADO</div>

      <div class="bloque">
        <div id="l1" class="linea" data-layout-allow-overlap>Caracas lo cuenta</div>
        <div id="l2" class="linea acento" data-layout-allow-overlap>distinto</div>
      </div>''',
      '''    .banda { position: absolute; left: 60px; top: 420px; width: 960px; height: 539px;
      overflow: hidden; border-radius: 20px; border: 1px solid %s; }
    .banda-img { position: absolute; inset: 0; width: 100%%; height: 100%%;
      object-fit: cover; object-position: 50%% 42%%;
      filter: saturate(0.55) contrast(1.06) brightness(0.78); }
    .pie-banda { position: absolute; left: 60px; top: 986px; font-weight: 500; font-size: 25px;
      letter-spacing: 0.12em; text-transform: uppercase; color: %s; }

    .bloque { position: absolute; left: 60px; right: 60px; top: 1108px; }
    .linea { font-weight: 900; font-size: 104px; line-height: 1.0; letter-spacing: -0.045em; }
    .acento { color: %s; }
''' % (BORDE, MUTED, ACENTO), '''      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.04);

      // La banda entra entera, igual que la tarjeta del post: es el plano de la
      // alocucion, y trocearlo le quita lo que tiene de documento.
      tl.fromTo(q("#banda"), { y: 40, scale: 0.95, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.50, ease: "power4.out" }, 0.14);
      tl.fromTo(q("#pie-banda"), { opacity: 0 },
        { opacity: 1, duration: 0.30, ease: "power2.out" }, 0.62);

      tl.fromTo(q("#l1"), { scale: 1.16, filter: "blur(11px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.42, ease: "power4.out" }, 0.86);
      tl.fromTo(q("#l2"), { y: 62, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.40, ease: "circ.out" }, 1.18);
''')

# ----------------------------------------------------------------- 06 plazo
h, c = foto('refineria.jpg', '50% 46%', 'grayscale(1) contrast(1.14) brightness(0.36)',
            'linear-gradient(180deg, rgba(11,17,32,.62) 0%, rgba(11,17,32,.72) 40%, '
            'rgba(11,17,32,.96) 100%)')
frame('06-plazo', '4.2', h + '''
      <div class="kicker">LO QUE DIJO DELCY RODR&Iacute;GUEZ</div>

      <div class="cifra-bloque">
        <div id="cifra" class="cifra tabular" data-layout-allow-overlap>0</div>
        <div id="unidad" class="unidad" data-layout-allow-overlap>A&Ntilde;OS DE ACUERDO BINACIONAL</div>
      </div>

      <div id="hl" class="hairline" style="top: 1268px"></div>
      <div class="datos">
        <div id="d1" class="dato">17 campos estrat&eacute;gicos.</div>
        <div id="d2" class="dato">Meta: m&aacute;s de 1,5 millones de barriles diarios.</div>
      </div>''',
      c + '''    .cifra-bloque { position: absolute; left: 60px; right: 60px; top: 820px; }
    .cifra { font-weight: 900; font-size: 340px; line-height: 0.86; letter-spacing: -0.05em;
      color: %s; transform-origin: left center; }
    .unidad { margin-top: 28px; font-weight: 500; font-size: 32px; letter-spacing: 0.14em;
      text-transform: uppercase; color: %s; }
    .datos { position: absolute; left: 60px; right: 60px; top: 1314px; }
    .dato { font-weight: 400; font-size: 44px; line-height: 1.36; color: %s; }
''' % (ACENTO, MUTED, FG), '''      tl.fromTo(q("#foto"), { scale: 1.12 }, { scale: 1.02, duration: 2.6, ease: "power3.out" }, 0);
      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.06);

      // counting-dynamic-scale: valor y escala comparten posicion y ease.
      var el = q("#cifra"), st = { v: 0 }, DUR = 0.9, INI = 0.24, EASE = "power2.out";
      tl.to(st, { v: 25, duration: DUR, ease: EASE,
        onUpdate: function () { el.textContent = String(Math.round(st.v)); } }, INI);
      tl.fromTo(el, { scale: 0.84, opacity: 0 },
        { scale: 1, opacity: 1, duration: DUR, ease: EASE }, INI);
      tl.fromTo(q("#unidad"), { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, INI + DUR);

      tl.fromTo(q("#hl"), { scaleX: 0 },
        { scaleX: 1, duration: 0.44, ease: "power3.inOut" }, 1.66);
      tl.fromTo(q("#d1"), { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 1.90);
      tl.fromTo(q("#d2"), { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 2.24);
''')

# ---------------------------------------------------------------- 07 plazos
# El 100 contra el 25 no es una correccion nuestra: es literalmente la tesis del
# video. Toda la semana se publico "100 anos de acceso"; Delcy salio anoche a
# decir 25. Poner las dos cifras a la misma altura, cada una con su procedencia,
# es lo unico honesto — y es mas fuerte que elegir una.
frame('07-plazos', '4.2', '''
      <div class="kicker">CU&Aacute;NTO DURA, SEG&Uacute;N QUI&Eacute;N</div>

      <div class="lados">
        <div id="lado-a" class="lado">
          <div class="lado-cifra tabular">100</div>
          <div class="lado-etq">A&Ntilde;OS &middot; LO QUE SE PUBLIC&Oacute; DESDE EL VIERNES</div>
        </div>
        <div id="rule" class="rule"></div>
        <div id="lado-b" class="lado">
          <div class="lado-cifra acento tabular">25</div>
          <div class="lado-etq">A&Ntilde;OS &middot; LO QUE DIJO CARACAS ANOCHE</div>
        </div>
      </div>

      <div id="hl" class="hairline" style="top: 1372px"></div>
      <div id="nota" class="nota">El texto del acuerdo no se ha hecho p&uacute;blico.</div>''',
      '''    .lados { position: absolute; left: 60px; right: 60px; top: 760px; }
    .lado { padding: 34px 0; }
    .lado-cifra { font-weight: 900; font-size: 168px; line-height: 1.0;
      letter-spacing: -0.05em; color: %s; }
    .lado-etq { margin-top: 14px; font-weight: 500; font-size: 25px; letter-spacing: 0.13em;
      text-transform: uppercase; color: %s; }
    .acento { color: %s; }
    .rule { width: 100%%; height: 1px; background: %s; transform-origin: left center; }
    .nota { position: absolute; left: 60px; right: 60px; top: 1418px;
      font-weight: 400; font-size: 42px; line-height: 1.34; color: %s; }
''' % (MUTED, MUTED, ACENTO, BORDE, MUTED), '''      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.04);

      // El 100 entra primero y en --muted: es lo que el lector ya trae en la
      // cabeza. El 25 llega despues y en acento, porque es la novedad.
      tl.fromTo(q("#lado-a"), { xPercent: -12, opacity: 0 },
        { xPercent: 0, opacity: 1, duration: 0.44, ease: "power4.out" }, 0.18);
      tl.fromTo(q("#rule"), { scaleX: 0 },
        { scaleX: 1, duration: 0.48, ease: "power3.inOut" }, 0.64);
      tl.fromTo(q("#lado-b"), { xPercent: 12, opacity: 0 },
        { xPercent: 0, opacity: 1, duration: 0.44, ease: "power4.out" }, 1.10);

      tl.fromTo(q("#hl"), { scaleX: 0 },
        { scaleX: 1, duration: 0.44, ease: "power3.inOut" }, 1.86);
      tl.fromTo(q("#nota"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 2.10);
''')

# -------------------------------------------------------------- 08 ingresos
h, c = foto('dinero.jpg', '50% 50%', 'grayscale(1) contrast(1.2) brightness(0.32)',
            'linear-gradient(180deg, rgba(11,17,32,.62) 0%, rgba(11,17,32,.72) 42%, '
            'rgba(11,17,32,.94) 100%)')
frame('08-ingresos', '4.6', h + '''
      <div class="kicker">LO QUE CALCULA CARACAS</div>

      <div class="cifra-bloque">
        <div id="cifra" class="cifra tabular" data-layout-allow-overlap>US$ 0</div>
        <div id="unidad" class="unidad" data-layout-allow-overlap>MILLONES PARA EL ESTADO VENEZOLANO</div>
      </div>

      <div id="hl" class="hairline" style="top: 1240px"></div>
      <div class="datos">
        <div id="d1" class="dato">Calculado con el barril a 65 d&oacute;lares.</div>
        <div id="d2" class="dato acento">Unos 19 d&oacute;lares por cada barril vendido.</div>
      </div>''',
      c + '''    .cifra-bloque { position: absolute; left: 60px; right: 60px; top: 880px; }
    .cifra { font-weight: 900; font-size: 152px; line-height: 1.0; letter-spacing: -0.045em;
      color: %s; transform-origin: left center; }
    .unidad { margin-top: 26px; font-weight: 500; font-size: 30px; letter-spacing: 0.13em;
      text-transform: uppercase; color: %s; }
    .datos { position: absolute; left: 60px; right: 60px; top: 1286px; }
    .dato { font-weight: 400; font-size: 44px; line-height: 1.36; color: %s; margin-bottom: 16px; }
    .acento { color: %s; font-weight: 600; }
''' % (ACENTO, MUTED, FG, ACENTO), '''      tl.fromTo(q("#foto"), { scale: 1.12 }, { scale: 1.02, duration: 2.8, ease: "power3.out" }, 0);
      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.06);

      // La cifra se cuenta entera: es la respuesta de Caracas a "un regalo",
      // y el ojo tiene que perseguirla hasta el final.
      var el = q("#cifra"), st = { v: 0 }, DUR = 1.5, INI = 0.26, EASE = "power2.out";
      tl.to(st, { v: 209335, duration: DUR, ease: EASE,
        onUpdate: function () {
          el.textContent = "US$ " + Math.round(st.v).toLocaleString("es-VE");
        } }, INI);
      tl.fromTo(el, { scale: 0.88, opacity: 0 },
        { scale: 1, opacity: 1, duration: DUR, ease: EASE }, INI);
      tl.fromTo(q("#unidad"), { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, INI + DUR);

      // El supuesto del precio va pegado a la cifra: sin el, 209.335 millones
      // se lee como una cantidad firme y es una estimacion.
      tl.fromTo(q("#hl"), { scaleX: 0 },
        { scaleX: 1, duration: 0.44, ease: "power3.inOut" }, 2.16);
      tl.fromTo(q("#d1"), { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 2.40);
      tl.fromTo(q("#d2"), { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 2.76);
''')

# ------------------------------------------------------------ 09 condiciones
h, c = foto('contrato.jpg', '50% 50%', 'grayscale(1) contrast(1.14) brightness(0.34)',
            'linear-gradient(180deg, rgba(11,17,32,.64) 0%, rgba(11,17,32,.76) 42%, '
            'rgba(11,17,32,.96) 100%)')
frame('09-condiciones', '4.4', h + '''
      <div class="kicker">CON QU&Eacute; CONDICIONES</div>

      <div class="pares">
        <div id="p1" class="par">
          <div class="par-cifra tabular">16 %</div>
          <div class="par-etq">REGAL&Iacute;AS M&Iacute;NIMAS</div>
        </div>
        <div id="p2" class="par">
          <div class="par-cifra tabular">34 %</div>
          <div class="par-etq">IMPUESTO SOBRE LA RENTA</div>
        </div>
      </div>

      <div id="hl" class="hairline" style="top: 1300px"></div>
      <div class="datos">
        <div id="d1" class="dato">8 bloques nuevos en la Faja del Orinoco.</div>
        <div id="d2" class="dato">Ella lo compara con la apertura de hace 30 a&ntilde;os,</div>
        <div id="d3" class="dato acento">cuando las regal&iacute;as eran del 1 %.</div>
      </div>''',
      c + '''    .pares { position: absolute; left: 60px; right: 60px; top: 880px;
      display: flex; gap: 80px; }
    .par-cifra { font-weight: 900; font-size: 148px; line-height: 1.0; letter-spacing: -0.045em;
      color: %s; }
    .par-etq { margin-top: 20px; font-weight: 500; font-size: 26px; letter-spacing: 0.13em;
      text-transform: uppercase; color: %s; }
    .datos { position: absolute; left: 60px; right: 60px; top: 1346px; }
    .dato { font-weight: 400; font-size: 40px; line-height: 1.34; color: %s; }
    .acento { color: %s; font-weight: 600; }
''' % (ACENTO, MUTED, FG, ACENTO), '''      tl.fromTo(q("#foto"), { scale: 1.12 }, { scale: 1.02, duration: 2.8, ease: "power3.out" }, 0);
      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.06);

      // Dos cifras a la vez es la excepcion del video, y se sostiene porque son
      // el mismo tipo de dato (porcentajes de un contrato) y entran una tras otra.
      tl.fromTo(q("#p1"), { scale: 1.16, filter: "blur(11px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.44, ease: "power4.out" }, 0.26);
      tl.fromTo(q("#p2"), { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.42, ease: "circ.out" }, 0.74);

      tl.fromTo(q("#hl"), { scaleX: 0 },
        { scaleX: 1, duration: 0.44, ease: "power3.inOut" }, 1.60);
      // La comparacion con el 1 % es SUYA, no nuestra: por eso "Ella lo compara".
      tl.fromTo(q("#d1"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 1.84);
      tl.fromTo(q("#d2"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 2.16);
      tl.fromTo(q("#d3"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 2.44);
''')

# ------------------------------------------------------------- 10 soberania
h, c = foto('delcy-alocucion.webp', '50% 40%', 'grayscale(1) contrast(1.12) brightness(0.66) blur(18px)',
            'linear-gradient(180deg, rgba(11,17,32,.58) 0%, rgba(11,17,32,.40) 24%, '
            'rgba(11,17,32,.88) 54%, rgba(11,17,32,.98) 100%)')
frame('10-soberania', '4.0', h + '''
      <div class="kicker">SU MENSAJE POL&Iacute;TICO</div>

      <div class="cita">
        <div id="c1" class="cita-linea acento" data-layout-allow-overlap>&laquo;Venezuela</div>
        <div id="c2" class="cita-linea acento" data-layout-allow-overlap>conserva la propiedad</div>
        <div id="c3" class="cita-linea acento" data-layout-allow-overlap>y la soberan&iacute;a&raquo;</div>
      </div>

      <div id="hl" class="hairline" style="top: 1300px"></div>
      <div id="nota" class="nota">Agradeci&oacute; a Trump y a Marco Rubio.</div>''',
      c + '''    .cita { position: absolute; left: 60px; right: 60px; top: 986px; }
    .cita-linea { font-weight: 900; font-size: 88px; line-height: 1.06; letter-spacing: -0.04em; }
    .acento { color: %s; }
    .nota { position: absolute; left: 60px; right: 60px; top: 1346px;
      font-weight: 400; font-size: 42px; line-height: 1.36; color: %s; }
''' % (ACENTO, MUTED), '''      tl.fromTo(q("#foto"), { scale: 1.24 },
        { scale: 1.14, duration: 2.6, ease: "power3.out" }, 0);
      tl.to(q("#foto"), { scale: 1.18, duration: 1.4, ease: "none" }, 2.6);
      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.06);

      tl.fromTo(q("#c1"), { scale: 1.18, filter: "blur(12px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.44, ease: "power4.out" }, 0.24);
      tl.fromTo(q("#c2"), { x: -200, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.40, ease: "expo.out" }, 0.66);
      tl.fromTo(q("#c3"), { y: 60, rotation: 2, opacity: 0 },
        { y: 0, rotation: 0, opacity: 1, duration: 0.44, ease: "circ.out" }, 1.08);

      tl.fromTo(q("#hl"), { scaleX: 0 },
        { scaleX: 1, duration: 0.44, ease: "power3.inOut" }, 1.70);
      tl.fromTo(q("#nota"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 1.94);
''')

# ---------------------------------------------------------------- 11 choque
# Sin foto: es el frame donde las dos versiones se miran de frente, y cualquier
# imagen le daria la razon a una de las dos.
frame('11-choque', '4.4', '''
      <div class="kicker">LA MISMA FIRMA, DOS RELATOS</div>

      <div class="lados">
        <div id="lado-a" class="lado">
          <div class="lado-quien">TRUMP</div>
          <div class="lado-que">&laquo;Un regalo&raquo;</div>
        </div>
        <div id="rule" class="rule"></div>
        <div id="lado-b" class="lado">
          <div class="lado-quien">VENEZUELA</div>
          <div class="lado-que acento tabular">209.335 millones</div>
          <div class="lado-nota">de d&oacute;lares para el Estado</div>
        </div>
      </div>''',
      '''    .lados { position: absolute; left: 60px; right: 60px; top: 700px; }
    .lado { padding: 40px 0; }
    .lado-quien { font-weight: 500; font-size: 28px; letter-spacing: 0.14em;
      text-transform: uppercase; color: %s; }
    .lado-que { margin-top: 22px; font-weight: 900; font-size: 106px; line-height: 1.02;
      letter-spacing: -0.04em; color: %s; }
    .lado-nota { margin-top: 18px; font-weight: 400; font-size: 40px; color: %s; }
    .acento { color: %s; }
    .rule { width: 100%%; height: 1px; background: %s; transform-origin: left center; }
''' % (MUTED, FG, MUTED, ACENTO, BORDE), '''      tl.fromTo(q(".kicker"), { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" }, 0.04);

      // comparison-split: los dos lados llegan desde fuera, uno por lado, y el
      // hairline los separa. El frame no elige: los pone a la misma altura.
      tl.fromTo(q("#lado-a"), { xPercent: -12, opacity: 0 },
        { xPercent: 0, opacity: 1, duration: 0.46, ease: "power4.out" }, 0.20);
      tl.fromTo(q("#rule"), { scaleX: 0 },
        { scaleX: 1, duration: 0.50, ease: "power3.inOut" }, 0.70);
      tl.fromTo(q("#lado-b"), { xPercent: 12, opacity: 0 },
        { xPercent: 0, opacity: 1, duration: 0.46, ease: "power4.out" }, 1.20);
''')

# ---------------------------------------------------------------- 12 cierre
frame('12-cierre', '3.6', '''
      <div id="acento-campo" class="acento-campo"></div>
      <div class="num">12</div>

      <div class="bloque">
        <div id="l1" class="linea" data-layout-allow-overlap>&iquest;Y esto mueve</div>
        <div id="l2" class="linea" data-layout-allow-overlap>la tasa?</div>
        <div id="sub" class="sub">Seguimos atentos a los acontecimientos.</div>
      </div>

      <div class="firma">
        <div id="rule" class="rule"></div>
        <div id="marca-pie" class="marca-pie">LA TASA &middot; @LATASA.ONLINE</div>
      </div>''',
      '''    #root { color: %s; }
    .acento-campo { position: absolute; inset: 0; background: %s; transform-origin: center bottom; }
    .num { position: absolute; top: 116px; left: 60px; font-weight: 500; font-size: 26px;
      letter-spacing: 0.14em; color: rgba(11,17,32,0.62); }
    .marca-nombre { color: %s; }
    .bloque { position: absolute; left: 60px; right: 60px; top: 800px; }
    .linea { font-weight: 900; font-size: 138px; line-height: 0.96; letter-spacing: -0.045em;
      color: %s; }
    .sub { margin-top: 48px; font-weight: 400; font-size: 48px; line-height: 1.34;
      color: rgba(11,17,32,0.62); }
    .firma { position: absolute; left: 60px; top: 1420px; }
    .rule { width: 36px; height: 2px; background: %s; transform-origin: left center; }
    .marca-pie { margin-top: 26px; font-weight: 500; font-size: 28px; letter-spacing: 0.14em;
      color: rgba(11,17,32,0.75); }
''' % (BG, ACENTO, BG, BG, BG), '''      // El cambio de registro es el remate, igual que en el primer video: el
      // acento sube desde abajo. Transform, no clip-path.
      tl.fromTo(q("#acento-campo"), { scaleY: 0 },
        { scaleY: 1, duration: 0.26, ease: "power4.out" }, 0);
      tl.fromTo(q(".num"), { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: "power2.out" }, 0.26);

      var P = 0.3;
      tl.fromTo(q("#l1"), { scale: 1.18, filter: "blur(11px)", opacity: 0 },
        { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.44, ease: "power4.out" }, P * 0.9);
      tl.fromTo(q("#l2"), { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.42, ease: "circ.out" }, P * 2.0);
      tl.fromTo(q("#sub"), { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.36, ease: "power3.out" }, 1.14);

      tl.fromTo(q("#rule"), { scaleX: 0 },
        { scaleX: 1, duration: 0.30, ease: "power3.inOut" }, 1.66);
      tl.fromTo(q("#marca-pie"), { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" }, 1.84);
''')


# Borra los frames que ya no produce el generador. Sin esto, renombrar un frame
# deja el archivo viejo en el directorio: no llega al video -el indice se arma
# desde STORYBOARD.md- pero enturbia cualquier cuenta que se haga sobre la
# carpeta, que es justo como se colo un frame fantasma de 4s.
vivos = set(cid + '.html' for cid, _, _, _, _ in FRAMES)
for viejo in sorted(os.listdir(SALIDA)):
    if viejo.endswith('.html') and viejo not in vivos:
        os.remove(os.path.join(SALIDA, viejo))
        print('huerfano borrado: %s' % viejo)

total = 0.0
for cid, dur, html, css, js in FRAMES:
    ruta = os.path.join(SALIDA, cid + '.html')
    io.open(ruta, 'w', encoding='utf-8', newline='\n').write(PLANTILLA.format(
        cid=cid, dur=dur, html=html, marca=MARCA_HTML, css_base=CSS_BASE, css=css, js=js))
    print('%-18s %5ss' % (cid, dur))
    total += float(dur)
print('---\nTOTAL %.1fs en %d frames' % (total, len(FRAMES)))
