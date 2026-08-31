---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "La Tasa te dice en dos segundos cuánto vale de verdad tu dinero en la frontera"
destination: instagram-reels
aspect: 1080x1920
language: es
audience: "Comerciantes y viajeros de la frontera colombo-venezolana (Cúcuta / Táchira), en el teléfono, con señal intermitente"
length: 15s
angle: dolor-solucion-cta
---

## Intent

Reel promocionado con Meta Ads para captar seguidores en Instagram y suscriptores
del canal de WhatsApp de La Tasa. Arco de tres tiempos: el dolor (no saber a cómo
está el cambio), la solución (la calculadora resuelve en dos segundos), y el remate
(la brecha que se paga de más fuera del BCV). Cierra pidiendo dos acciones concretas
—seguir en Instagram y unirse al canal—, mostrando el gesto, no solo el destino.

Tono: directo, sin adorno, tema oscuro fijo. La misma sobriedad que la app: se ve
de pie, en un negocio, en un teléfono.

## Assets

- ../tasas-del-dia/assets/geist-latin.woff2 — Geist Sans, la única tipografía del proyecto.
- ../tasas-del-dia/.media/audio/sfx/sfx_001.mp3 — tick corto (stagger del teclado numérico).
- ../tasas-del-dia/.media/audio/sfx/sfx_002.mp3 — riser de tensión (escena de la brecha).
- ../tasas-del-dia/.media/audio/sfx/sfx_003.mp3 — impacto grave (aterrizaje de la tarjeta de brecha).
- ../tasas-del-dia/.media/audio/sfx/sfx_004.mp3 — barrido / whoosh (transiciones).
- ../tasas-del-dia/.media/audio/sfx/sfx_005.mp3 — chime (bisagra y cierre).
- public/icon-512.png — logo de La Tasa (la taza), para el sello y la card final.
- Pexels (PEXELS_API_KEY en .env.local) — clip vertical de stock para la escena 1.

## Customizations

- 15.0s exactos, no aproximados: es un ad pagado con duración comprada.
- Siete escenas con cortes en 2.5 / 6.0 / 9.5 / 10.5 / 12.0 / 13.5.
- Cifras parametrizadas: resultadoEjemplo y brechaPorcentaje entran por variables de
  composición para poder sustituirlas por las tasas reales el día de la publicación.
- Las escenas de Instagram y WhatsApp muestran el GESTO (dedo tocando "Seguir" /
  "Unirse al canal"), no solo el destino.
- El mockup de la calculadora recrea la app real (teclado propio + display), no un
  teléfono genérico. El mockup de feed usa el estilo de tarjeta de /api/og/instagram-post.

## Notes

- Paleta cerrada a nueve tokens de ESTILOS.md. Ningún color crudo de Tailwind, ninguna
  variante clara. --warning (#fbbf24) solo si hace falta semánticamente, nunca decorativo.
- Una sola tipografía: Geist Sans, en todo el video.
- El resultado de la calculadora y la brecha tienen que ser cifras coherentes con una
  tasa real (criterio de formatRate()), no números inventados.
- Sin locución. Diseño sonoro de SFX solamente, reutilizando la paleta de tasas-del-dia.
- Sin captura de sitio: el sistema de diseño sale de ESTILOS.md, que ya está en el repo.
