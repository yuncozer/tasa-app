---
workflow: faceless-explainer
flow: automation
storyboard: no
message: "EE.UU. tomó el 55 % del petróleo venezolano por 100 años, y lo firmó con un gobierno que nadie eligió"
destination: instagram-reel
aspect: 1080x1920
language: es
audience: "Público general de la frontera colombo-venezolana (Cúcuta / Táchira), sin formación económica"
length: 34s
angle: narrative
style_preset: broadside
---

## Intent

Reel de noticia para La Tasa. Los primeros 2 segundos son un gancho duro que frene
el scroll; el resto entrega los hechos clave en lenguaje llano, sin tecnicismos.
Tono: noticiero serio, urgente, no sensacionalista. Cierra conectando con el
lector real de La Tasa: la frontera.

## Assets

- public/fotos/trump.jpg — Donald Trump en la Casa Blanca; gancho, frame 1.
- public/fotos/bandera-usa.jpg — bandera de EE.UU. hondeando; fondo del frame 1.
- public/fotos/mapa-venezuela.jpg — mapa con Venezuela resaltada; frame 2.
- public/fotos/petroleo.jpg — balancín petrolero con bandera venezolana; frames 2 y 4.
- public/fotos/delcy.jpg — Delcy Rodríguez; frame 3.
- public/fotos/rubio.jpg — Marco Rubio; frame 3.

## Customizations

- Count-up en las tres cifras protagonistas: 65.000 millones, 100 años y 55 %.
- El video plantea el ángulo de legitimidad: con quién firmó EE.UU. Se sostiene
  solo con hechos verificables y atribuidos, nunca con calificativos propios.
- Sin locución generada: el proyecto no usa TTS (ver CLAUDE.md de La Tasa). Se
  entrega GUION.md para grabar la voz aparte en CapCut si se quiere.

## Notes

- No afirmar más de lo reportado: fue un anuncio de Trump, confirmado por Delcy
  Rodríguez. Nada de proyecciones propias sobre la tasa.
- Nada de jerga: "reservas probadas", "licencia OFAC" y similares se traducen.
- Paleta y tipografía: los tokens de La Tasa (`ESTILOS.md` §2 y §3), no la
  paleta propia del preset. El remix automático mapeó el acento a `#fbbf24`
  (que aquí es `--warning` y nunca es decorativo) y se corrigió a mano a
  `--accent` #34d399.
