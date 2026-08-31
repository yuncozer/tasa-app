// Step 4: inyecta la secuencia de plano time-coded en cada frame del STORYBOARD,
// más el bloque único de dirección de video. Se ejecuta una sola vez; es
// idempotente (si ya existe la sección, la reemplaza).
import { readFileSync, writeFileSync } from "node:fs";

const SB = "STORYBOARD.md";
let t = readFileSync(SB, "utf8");

const secuencias = {
  "01-dolor": `### Secuencia de plano

- **Scene 1 (0.0–1.4s)** — El clip llena el cuadro bajo el velo. Un solo **push**
  (\`multi-phase-camera\`) de escala 1.06 → 1.00 sobre la raíz, con asentamiento
  largo (\`power3\`). El movimiento se gasta entero en la primera mitad: la
  doctrina prohíbe empujar en la segunda, porque ahí desvía la mirada.
- **Scene 2 (1.4–1.8s)** — Quietud absoluta. Nada se mueve. Es el hueco que hace
  que el signo se note.
- **Scene 3 (1.8–2.5s)** — El signo de interrogación entra con **spring-pop
  entrance** (\`spring-pop-entrance\`) en su registro suave, sin rebasar: opacidad
  0 → .55 y escala 0.86 → 1.0. Asienta y se queda quieto hasta el corte.`,

  "02-solucion": `### Secuencia de plano

- **Scene 1 (0.0–0.20s | 2.5–2.70s)** — El corte trae la app ya montada: display y
  teclado entran juntos con un alza corta (escala 0.985 → 1.0, opacidad 0 → 1,
  \`power3\`). Es el único momento en que algo entra en bloque, y dura 200 ms —
  el corte seco desde el metraje es el efecto.
- **Scene 2 (0.20–0.44s | 2.70–2.94s)** — \`{montoEjemplo}\` se teclea con
  **revelado escalonado por dígito** (\`dynamic-content-sequencing\`), 80 ms entre
  uno y otro. Cada dígito dispara la tecla que le toca con **button press**
  (\`press-release-spring\`): compresión a .95 y recuperación, con el tinte
  \`accent/20\` de la app. Un tick por dígito.
- **Scene 3 (0.40–0.75s | 2.90–3.25s)** — El bloque de resultado aterriza:
  desplazamiento de +28 px a 0 con fundido, 300 ms, \`power3\`
  (\`spring-pop-entrance\`, registro suave). Whoosh en 2.90s. Es el pago del plano.
- **Scene 4 (1.50–2.10s | 4.00–4.60s)** — La frase entra **palabra por palabra**
  (\`dynamic-content-sequencing\`) bajo el mockup.
- **Scene 5 (2.40–2.90s | 4.90–5.40s)** — Revelado de la segunda mitad, que es lo
  que impide que el plano se congele: **keyword glow** (\`asr-keyword-glow\`) sobre
  «dos segundos», y la cifra del resultado recibe un realce de escala mínimo
  (1.0 → 1.02 → 1.0) en la misma envolvente.
- **Scene 6 (2.90–3.50s | 5.40–6.00s)** — Sostiene. Solo **jitter sutil**
  (\`sine-wave-loop\`, amplitud baja) sobre el bloque de resultado.`,

  "03-brecha": `### Secuencia de plano

- **Scene 1 (0.0–0.50s | 6.0–6.5s)** — Campo oscuro casi vacío. Solo el rótulo «La
  brecha de hoy» aparece arriba, pequeño y en \`muted\`, con fundido corto. La
  tarjeta todavía no está.
- **Scene 2 (0.50–2.00s | 6.5–8.0s)** — **Quietud antes del clímax**, sostenida por
  el riser. Lo único que evoluciona es un **ambient glow** (\`ambient-glow-bloom\`)
  que crece muy despacio detrás del centro del cuadro. Ningún elemento entra: el
  vacío es lo que carga el impacto.
- **Scene 3 (2.00–2.40s | 8.0–8.4s)** — Impacto. La tarjeta aterriza con
  **spring-pop entrance** (\`spring-pop-entrance\`), escala 0.9 → 1.0 con
  asentamiento largo, sincronizada al golpe grave de 8.0s. En el mismo gesto el
  hero arranca su **contador con escala ligada al valor**
  (\`counting-dynamic-scale\`): sube de 0,0% a \`{brechaPorcentaje}\` mientras crece
  de .82 a 1.0 de tamaño, de modo que la subida misma se siente.
- **Scene 4 (2.40–3.05s | 8.4–9.05s)** — Revelado de la segunda mitad: la línea de
  apoyo entra **palabra por palabra** (\`dynamic-content-sequencing\`) bajo la
  cifra.
- **Scene 5 (3.05–3.50s | 9.05–9.5s)** — **Keyword glow** (\`asr-keyword-glow\`)
  sobre la cifra, una sola vez, y sostiene con **jitter sutil**
  (\`sine-wave-loop\`). Sin semáforo: el glow es del acento, no cambia de color con
  el valor.`,

  "04-bisagra": `### Secuencia de plano

Un segundo entero, así que **un solo movimiento por elemento** y nada más
(\`titlecard-reveal\`: la poca moción es la carga, no una carencia).

- **Scene 1 (0.0–0.35s | 9.5–9.85s)** — El logo entra a la esquina superior
  izquierda desde fuera de cuadro (x −140 → 120), con fundido y \`power3\`. Chime.
- **Scene 2 (0.30–0.70s | 9.80–10.2s)** — «Gratis.» entra con alza y fundido
  (+40 px → 0, \`power3\`, \`spring-pop-entrance\` en registro suave). Se solapa
  30 ms con la entrada del logo para que el plano no tenga dos arranques.
- **Scene 3 (0.70–1.00s | 10.2–10.5s)** — Quietud. El logo queda **exactamente**
  en x 120 / y 150 / escala 1.0 / opacidad 1, que es el estado que heredan las
  escenas 5 y 6.`,

  "05-instagram": `### Secuencia de plano

El logo **no entra**: arranca ya asentado en x 120 / y 150 / escala 1.0 /
opacidad 1, heredado de la escena 4. Animarlo otra vez rompería la continuidad.

- **Scene 1 (0.0–0.30s | 10.5–10.8s)** — La pila de tarjetas entra desde abajo con
  **revelado escalonado** (\`dynamic-content-sequencing\`): primero la de atrás,
  luego la del medio, luego la principal, 70 ms entre cada una, \`power3\`. Whoosh
  en 10.5s.
- **Scene 2 (0.30–0.75s | 10.8–11.25s)** — El dedo entra desde fuera del cuadro por
  abajo a la derecha y viaja hasta «Seguir» (\`cursor-click-ripple\`, fase de
  aproximación). La trayectoria es una curva, no una recta.
- **Scene 3 (0.75–0.95s | 11.25–11.45s)** — El toque: **button press**
  (\`press-release-spring\`) comprime botón y dedo a la vez, sale la onda del
  \`cursor-click-ripple\`, y la etiqueta cambia de «Seguir» a «Siguiendo» con un
  **hard-cut word swap** (\`discrete-text-sequence\`) — corte instantáneo, sin
  fundido: el cambio de estado es el beat.
- **Scene 4 (0.95–1.50s | 11.45–12.0s)** — Revelado de la segunda mitad: la frase
  entra **palabra por palabra** y el handle detrás, con un realce de acento
  (\`dynamic-content-sequencing\`). Sostiene.`,

  "06-whatsapp": `### Secuencia de plano

Mismo contrato que la escena 5: el logo arranca asentado en la esquina y **no se
mueve en todo el plano**. No hay salida hacia el centro — eso lo recoge la escena
7 desde su propio t=0, porque un movimiento de salida aquí quedaría truncado por
el corte.

- **Scene 1 (0.0–0.30s | 12.0–12.3s)** — La tarjeta del canal entra desde abajo
  (+60 px → 0, fundido, \`power3\`). Whoosh en 12.0s.
- **Scene 2 (0.30–0.60s | 12.3–12.6s)** — La burbuja del mensaje cae dentro con
  **spring-pop entrance** (\`spring-pop-entrance\`, suave) — llega después que su
  contenedor, que es el orden en que ocurre de verdad.
- **Scene 3 (0.60–1.05s | 12.6–13.05s)** — El dedo entra desde abajo y viaja al
  botón «Unirse al canal»; toque con **button press** (\`press-release-spring\`) y
  onda (\`cursor-click-ripple\`). La etiqueta pasa a «Te uniste» con **hard-cut
  word swap** (\`discrete-text-sequence\`).
- **Scene 4 (1.05–1.50s | 13.05–13.5s)** — La frase entra **palabra por palabra**
  (\`dynamic-content-sequencing\`). Sostiene con **jitter sutil**.`,

  "07-cierre": `### Secuencia de plano

Escena final: es la única que **sí** puede llevar asentamiento de salida.

- **Scene 1 (0.0–0.55s | 13.5–14.05s)** — El logo arranca en x 120 / y 150 /
  escala 1.0 —el estado exacto en que lo dejó la escena 6— y viaja al centro
  creciendo a 1.6 (\`coordinate-target-zoom\` aplicado al propio elemento, con
  contra-traslación para que el encuadre no se desplace), \`power3\`. Es la
  bisagra visual del cierre y el único movimiento grande del plano.
- **Scene 2 (0.45–0.75s | 13.95–14.25s)** — «La Tasa» entra debajo con **revelado
  escalonado por letra** (\`dynamic-content-sequencing\`), solapando el final del
  viaje del logo.
- **Scene 3 (0.75–1.05s | 14.25–14.55s)** — El handle y el ícono de WhatsApp entran
  escalonados, 90 ms entre uno y otro, con fundido y alza corta.
- **Scene 4 (1.05–1.50s | 14.55–15.0s)** — «Síguenos. Únete.» entra **palabra por
  palabra**, chime final, y todo asienta y se queda inmóvil. Silencio. No hay
  fundido a negro: el corte duro al final es lo que deja la marca en pantalla
  hasta el último fotograma.`,
};

for (const [id, bloque] of Object.entries(secuencias)) {
  const marca = `- src: compositions/frames/${id}.html`;
  if (!t.includes(marca)) throw new Error(`no encuentro el frame ${id}`);
  // Inserta la sección justo antes del siguiente encabezado de frame (o del final).
  const desde = t.indexOf(marca);
  const sig = t.indexOf("\n## ", desde);
  const corte = sig === -1 ? t.length : sig;
  const cuerpo = t.slice(desde, corte);
  if (cuerpo.includes("### Secuencia de plano")) {
    const limpio = cuerpo.slice(0, cuerpo.indexOf("### Secuencia de plano"));
    t = t.slice(0, desde) + limpio.trimEnd() + "\n\n" + bloque + "\n" + t.slice(corte);
  } else {
    t = t.slice(0, desde) + cuerpo.trimEnd() + "\n\n" + bloque + "\n" + t.slice(corte);
  }
}

// El handoff de la escena 6 ya no es una salida: se corrige en su sitio.
t = t.replace(
  "- handoff_out: logo — sale hacia el centro para convertirse en el logo del cierre\n",
  "- handoff_out: logo — esquina superior izquierda, x 120 y 150, escala 1.0, opacidad 1, inmóvil; el viaje al centro lo hace la escena 7 desde su propio t=0\n",
);
t = t.replace(
  "- handoff_in: logo — llega desde la esquina al centro, escala 1.0→1.6, opacidad 1",
  "- handoff_in: logo — arranca en x 120 y 150, escala 1.0, opacidad 1, inmóvil; esta escena lo lleva al centro y a escala 1.6",
);

const direccion = `
## Video direction

**Una sola cámara, un solo material.** El fondo \`#0b1120\` es continuo de la
escena 2 a la 7: ninguna escena cambia de suelo, así que los cortes se leen como
cortes de plano dentro de la misma pieza y no como diapositivas encadenadas. La
única excepción es la escena 1, que es metraje real, y ese salto es el punto —
es la distancia entre el problema y la app.

**Curvas.** \`power3\` en todo, con cola larga. Nada de \`back.out\`, \`bounce.out\`
ni \`elastic.out\`: el rebote es el delator número uno del video hecho a máquina, y
esta marca vende fiabilidad de datos. La única excepción admitida sería un remate
explícitamente juguetón, y aquí no hay ninguno.

**Dónde se gasta el movimiento.** El grueso entra en el primer 30% de cada plano
y el resto se reserva para revelados escalonados en la segunda mitad. Ningún
plano empuja ni desplaza la cámara en su tramo final: eso desvía la mirada justo
cuando el espectador está leyendo la cifra. Durante los sostenidos, la única
vida permitida es **jitter de amplitud baja**; nada de respiración de tarjetas.

**El acento se raciona.** \`#34d399\` aparece exactamente en cuatro sitios y en
este orden: el resultado de la calculadora, la cifra de brecha, «Gratis.» y los
dos botones de acción del cierre. Fuera de ahí, todo es \`#f1f5f9\` sobre
\`#131c2f\`. Un acento que aparece en todas partes deja de señalar nada.

**\`#fbbf24\` no aparece.** En esta marca significa «este dato no es de fiar ahora
mismo», y nada en este video lo es. Usarlo de adorno rompería el significado que
tiene en la app.

**Los cortes son duros y caen en el beat.** Los siete \`transition_in\` son \`cut\`,
no fundidos: la pieza dura 15 segundos y un fundido de 300 ms se come un 2% del
anuncio para no decir nada. Cada corte coincide con un golpe del diseño sonoro.

**La zona segura manda.** Todo el contenido vive sobre y ≤ 1600 (el 83% superior).
No es una convención heredada: en un Reel, Instagram superpone ahí su propio
caption y sus botones, y lo que caiga debajo queda tapado en el dispositivo real.

**Tipografía.** Geist Sans en todo, con \`font-variant-numeric: tabular-nums\` en
cada cifra. Sin eso los dígitos cambian de ancho al contar y el número baila
mientras sube — que es exactamente el efecto contrario al que busca un contador.
`;

if (t.includes("\n## Video direction")) {
  t = t.slice(0, t.indexOf("\n## Video direction"));
}
t = t.trimEnd() + "\n" + direccion;

writeFileSync(SB, t, "utf8");
console.log("secuencias de plano + dirección de video inyectadas");
