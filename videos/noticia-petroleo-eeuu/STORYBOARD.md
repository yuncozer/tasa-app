---
format: 1080x1920
duration: 44s
message: "EE.UU. tomó el 55 % del petróleo venezolano por 100 años, y lo firmó con un gobierno sin mandato electoral"
arc: Gancho -> Puente -> Cifra -> Plazo -> Control -> Quiénes entran -> Promesa -> Quiénes firman -> Quién firmó por Venezuela -> Pregunta de fondo -> Y a mí qué
audience: "Publico general de la frontera colombo-venezolana, sin formacion economica"
mode: autonomous
music: none
---

## Frame 1 — Gancho

- scene: "¿el negocio del siglo?" en display sobre foto de Trump, con el encuadre debajo
- duration: 3.4s
- poster: 2.4s
- transition_in: cut
- status: animated
- voiceover: "¿El negocio del siglo? El megaacuerdo de Trump con Venezuela por el petróleo."
- src: compositions/frames/01-gancho.html
- blueprint: kinetic-type-beats
- focal: "la pregunta en display 900 lowercase, dos golpes"
- roles: "portada.jpg (composición de portada a sangre, color a media saturación + velo)"

El gancho es una **pregunta**, no una afirmación: obliga a quedarse a averiguar la
respuesta. La respuesta llega repartida en los tres frames de cifras siguientes, y
el video la cierra devolviéndole la pregunta al lector.

**Shot sequence**

- 0.00–0.35 · Full-bleed. `portada.jpg` en push desde 1.10 → 1.03 en 2,0s — el más abierto y más lento del video, para que dé tiempo a leer los tres retratos antes de que el encuadre cierre sobre el pozo. Kicker "ACUERDO EE.UU. – VENEZUELA" y marca arriba a la derecha.
- 0.35–0.96 · Primer golpe: **"¿el negocio"** con `kinetic-beat-slam` (scale-slam desde 1.32, blur 14px → 0).
- 0.96–1.42 · Segundo golpe en `--accent`: **"del siglo?"**, rise-rotate, con `chromatic-glitch` de 0.14s. **La pregunta está completa antes del segundo 1,5.**
- 1.62–2.14 · El encuadre cae línea a línea: "El megaacuerdo de Trump con / Venezuela por el petróleo."
- 2.30–3.40 · Quietud. Solo sigue el push del fondo.

**El texto vive en el tercio inferior** (titular a 1112px, encuadre a 1420px): arriba
mandan los retratos de la portada y el velo abre casi limpio ahí. La foto de Trump
suelta ya no se usa — la portada la incluye.

## Frame 2 — Te lo resumimos en cifras

- scene: "te lo resumimos en cifras" en display, con tres marcas que anuncian el bloque
- duration: 2.0s
- poster: 1.4s
- transition_in: cut
- status: animated
- voiceover: "Te lo resumimos en cifras."
- src: compositions/frames/02-resumen.html
- blueprint: titlecard-reveal
- focal: "la frase en dos golpes"
- roles: "portada.jpg (la misma del gancho, más cerrada y más apagada)"

**El frame más corto del video, y el único que no informa de nada.** Es una
respiración: cierra el gancho y abre el bloque de cifras, que son tres frames
seguidos de números grandes. Sin este corte, el lector pasa de una pregunta a un
65.000 sin transición y el primer número se pierde.

Por eso no lleva foto, ni kicker, ni letra chica: aquí no hay nada que leer despacio,
y su brevedad (2,0s frente a los 3,4–6,0s del resto) es justamente lo que lo hace
funcionar como respiración y no como frame más.

Las **tres marcas** de abajo anuncian la estructura de lo que viene —tres cifras—
sin adelantar los números.

**Shot sequence**

- 0.00–2.00 · Sigue la **misma portada**, un punto más cerrada (1.06 → 1.10, el push no se reinicia) y bastante más apagada. Compartir la imagen con el gancho hace que el puente se lea como continuación y no como frame nuevo: el corte de verdad es el que viene después, hacia las cifras.
- 0.06–0.46 · **"te lo resumimos"** con `kinetic-beat-slam` (scale-slam, blur 12px → 0).
- 0.34–0.72 · **"en cifras"** en `--accent`, entrada distinta (rise).
- 0.72–1.28 · Las tres marcas crecen en cascada corta (`scaleX`, stagger 0.1).
- 1.30–2.00 · Quietud corta.

## Frame 3 — La cifra

- scene: Count-up a 65.000 millones de barriles, con la escala explicada en tres líneas
- duration: 4.6s
- poster: 3.6s
- transition_in: cut
- status: animated
- voiceover: "Sesenta y cinco mil millones de barriles. El veinte por ciento de Venezuela. Solo Saudi Aramco tiene más."
- src: compositions/frames/03-cifra.html
- blueprint: dataviz-countup
- focal: "stat-value 65.000 con count-up"
- roles: "mapa-venezuela.jpg (banda superior), petroleo.jpg (banda inferior con el texto encima)"

La cifra sola no dice nada: 65.000 millones es un número sin escala para quien no
vive del petróleo. Por eso las tres líneas de abajo la miden contra tres cosas que
sí se entienden — Venezuela, EE.UU. y Aramco.

**Lo de Aramco no lleva frame propio** aunque es el dato más llamativo: es un hecho
de *escala*, y separado de la cifra que escala no significa nada.

**Shot sequence**

- 0.00–0.30 · Corte duro heredando el empuje: el mapa entra desde 1.10 → 1.0 sobre ground `--background`.
- 0.30–1.70 · `counting-dynamic-scale`: la cifra sube de 0 a **65.000** en `--accent`, escala 0.88 → 1.0. Debajo, etiqueta "MILLONES DE BARRILES". El kicker es "MIRA DE QUÉ TAMAÑO": recoge la promesa del gancho y la paga aquí mismo.
- 2.28–2.80 · La banda inferior con `petroleo.jpg` sube desde abajo.
- 2.52–3.28 · Las tres líneas caen una a una (`waterfall-entry`): "El 20 % de las reservas de Venezuela." / "Más de lo que tiene EE.UU. entero." / **"Solo Saudi Aramco tiene más."** en `--accent`.
- 3.28–3.80 · Quietud. Solo el pan mínimo de la banda.

## Frame 4 — El plazo

- scene: 100 en el cuerpo más grande del video, sobre el balancín petrolero
- duration: 3.8s
- poster: 2.8s
- transition_in: cut
- status: animated
- voiceover: "Cien años de acceso. Quien firma hoy no verá el final del contrato."
- src: compositions/frames/04-plazo.html
- blueprint: dataviz-countup
- focal: "el 100 a 400px, la cifra más grande de la pieza"
- roles: "petroleo.jpg (fondo full-bleed, desaturado)"

**Este es el dato que contesta el gancho.** El 55 % impresiona y los 65.000 millones
también, pero lo que convierte esto en "el negocio del siglo" es el plazo: un siglo.
Por eso se lleva el mayor cuerpo tipográfico del video y va antes que el reparto.

La línea de abajo lo traduce a escala humana —"quien firma hoy no verá el final del
contrato"— porque "100 años" en un contrato de concesión no le dice nada a alguien
que nunca ha visto uno.

**Shot sequence**

- 0.00–0.30 · `petroleo.jpg` en push desde 1.13 → 1.02, velo `--background`. Kicker "POR CUÁNTO TIEMPO".
- 0.26–1.18 · `counting-dynamic-scale`: 0 → **100** en `--accent` a 400px, escala 0.82 → 1.0. Conteo corto: lo que impresiona es el tamaño final, no el recorrido.
- 1.18–1.52 · Etiqueta "AÑOS DE ACCESO A LOS CAMPOS".
- 1.74–2.48 · Hairline + la lectura en llano, línea a línea.
- 2.50–3.40 · Quietud.

## Frame 5 — El control

- scene: Count-up a 55 % con una barra que reparte EE.UU. / Venezuela
- duration: 4.6s
- poster: 3.4s
- transition_in: cut
- status: animated
- voiceover: "Estados Unidos se queda con el cincuenta y cinco por ciento de la producción."
- src: compositions/frames/05-control.html
- blueprint: dataviz-countup
- focal: "el 55 % y su barra"
- roles: "bandera-usa.jpg (banda superior, muy oscurecida)"

El porcentaje va acompañado de **barra** (`stat-bars-and-fills`) porque un 55 % suelto
se lee como "la mitad y algo"; la barra enseña de un vistazo que es la parte mayor.

La letra chica explica de dónde sale ese 55 % —acciones más derecho a comprar el
crudo a precio de costo— porque sin eso el número suena a titular y no a estructura
del acuerdo. Y el socio privado va **atribuido**: las agencias dicen que no se reveló;
Avendaño lo identifica como el grupo Betancourt, y así se escribe.

**Shot sequence**

- 0.00–0.26 · La bandera entra en push desde 1.12 → 1.0 bajo un velo casi opaco. Kicker "QUIÉN SE QUEDA CON QUÉ".
- 0.26–1.36 · `counting-dynamic-scale`: 0 → **55 %** en `--accent`.
- 1.30–2.08 · La pista de la barra aparece y el relleno crece (`stat-bars-and-fills`, `scaleX`), con los dos pies: "EE.UU. 55 %" en acento y "VENEZUELA 45 %" en `--muted`.
- 2.14–2.80 · Hairline + la explicación y la atribución del socio privado.
- 2.80–3.40 · Quietud.

## Frame 6 — Quiénes entran

- scene: Las seis petroleras habilitadas, en cascada, y los 17 campos de remate
- duration: 4.8s
- poster: 3.4s
- transition_in: cut
- status: animated
- voiceover: "Seis petroleras habilitadas. Diecisiete campos."
- src: compositions/frames/06-petroleras.html
- blueprint: kinetic-type-beats
- focal: "la lista de seis nombres"
- roles: "ninguno — frame puramente tipográfico"

El único frame sin foto de la primera mitad, a propósito: son seis marcas que el
lector reconoce de vista y compiten mal con una imagen detrás. Van en **dos columnas**
porque seis en fila obligarían a un cuerpo que ya no se lee de pasada.

**Shot sequence**

- 0.00–0.34 · Kicker "QUIÉNES ENTRAN". Titular: **"6 petroleras"** con slam + **"habilitadas"** en side-snap.
- 0.88–1.40 · Los seis nombres caen en cascada (`waterfall-entry`, stagger 0.075 — el total se mantiene bajo ~0,5s para que llegue como un solo beat).
- 1.72–2.38 · Hairline + **"17 campos estratégicos"** con slam.
- 2.46–2.80 · La nota: "Licencias ampliadas por la OFAC el 27 de agosto."
- 2.90–3.40 · Quietud.

## Frame 7 — Lo que prometen

- scene: Dos promesas apiladas sobre el balancín petrolero, con la advertencia de remate
- duration: 3.6s
- poster: 2.8s
- transition_in: cut
- status: animated
- voiceover: "Prometen cien mil millones de dólares en inversión y miles de empleos. Sin fecha."
- src: compositions/frames/07-promesa.html
- blueprint: kinetic-type-beats
- focal: "US$ 100.000 millones"
- roles: "petroleo.jpg (fondo full-bleed, desaturado)"

Se marca explícitamente que son **promesas**, no hechos: es lo que dijeron Rubio y
Trump. El "Ninguna fecha confirmada" no es un adorno crítico — es el dato que falta.

**Shot sequence**

- 0.00–0.35 · `petroleo.jpg` full-bleed en push, velo al 68%. Kicker "LO QUE PROMETEN".
- 0.35–1.20 · **"US$ 100.000 millones"** en `--accent` con slam + "DE INVERSIÓN PRIVADA".
- 1.20–2.00 · **"miles de empleos"** en `--foreground` + "SEGÚN MARCO RUBIO".
- 1.86–2.46 · Hairline + "Ninguna fecha confirmada." en `--muted`.
- 2.46–3.00 · Quietud.

## Frame 8 — Quiénes lo firmaron

- scene: Rubio y Delcy Rodríguez en panel dividido, con la cita «un hito histórico»
- duration: 3.4s
- poster: 2.4s
- transition_in: cut
- status: animated
- voiceover: "Lo negociaron Marco Rubio y Delcy Rodríguez. Ella lo llamó un hito histórico."
- src: compositions/frames/08-quienes.html
- blueprint: comparison-split
- focal: "la cita «un hito histórico»"
- roles: "rubio.jpg (panel izquierdo), delcy.jpg (panel derecho)"

Sin adjetivos propios: se cita a quien habló. Este frame **existe para preparar el
siguiente**: primero se presenta a la firmante como autoridad, y solo después se
dice qué clase de autoridad es.

**Shot sequence**

- 0.00–0.44 · Los dos paneles entran desde fuera, separados por un hairline de 1px.
- 0.44–0.90 · Nombres y cargos en Geist uppercase bajo cada retrato.
- 1.02–1.78 · La cita **«un hito histórico»** cae en `--accent` con un solo golpe. Los retratos bajan a 55% y 4px de blur (`depth-of-field-blur`).
- 1.80–3.00 · Quietud sostenida sobre la cita.

## Frame 9 — Quién firmó por Venezuela

- scene: "un cargo encargado, no electo" sobre Delcy, con los tres hechos institucionales
- duration: 6.4s
- poster: 4.8s
- transition_in: cut
- status: animated
- voiceover: "Delcy Rodríguez asumió en enero, tras la salida de Maduro. Su cargo es encargado, no electo. El plazo para convocar elecciones ya venció."
- src: compositions/frames/09-legitimidad.html
- blueprint: kinetic-type-beats
- focal: "«un cargo encargado, no electo»"
- roles: "delcy.jpg (fondo full-bleed, desaturada + velo pesado)"

**El frame más largo del video, y el único que lo necesita.** Es la mitad del
argumento que no está en las cifras, y por eso los tres hechos que lo sostienen
entran uno a uno, con marcador `/` en acento, y cada uno tiene tiempo de leerse.

**Describe el cargo, no juzga a la persona.** Esto no es un matiz de estilo: la
cuenta la manejan personas reales y una afirmación sobre una funcionaria pesa
distinto que una descripción de una figura institucional. "Encargado, no electo"
es la definición de la figura y no una opinión sobre quién la ocupa; "tras la
salida de Nicolás Maduro del poder" es el término que usaron los propios medios
—[El Tiempo](https://www.eltiempo.com/mundo/venezuela/nicolas-maduro-fue-capturado-por-estados-unidos-y-salio-del-poder-tras-12-anos-que-sigue-para-venezuela-3514169)
tituló así— y describe lo mismo sin narrar la operación militar.

**El argumento no se debilita: se traslada.** Antes el video afirmaba y el lector
recibía; ahora el video expone tres hechos verificables y el lector concluye. La
conclusión es la misma y la frase ya no puede leerse como acusación de La Tasa.

Ninguno de los tres es opinión: la figura de presidenta encargada existe en la
Constitución como puente de 180 días hacia elecciones; ese plazo venció sin
convocatoria; y el cargo, por definición, no sale de una elección.

**El video no dice si el acuerdo es bueno o malo.** Dice quién lo firmó por
Venezuela y deja la valoración al lector — que es la única postura que La Tasa
puede sostener.

**Shot sequence**

- 0.00–0.30 · `delcy.jpg` full-bleed en el push más largo del video (1.12 → 1.02 en 2.4s). Kicker "QUIÉN FIRMÓ POR VENEZUELA".
- 0.26–1.16 · **"un cargo"** con slam + **"encargado, no electo"** en `--accent`, en rise. El cuerpo baja a 96px: la segunda línea es larga y a 124px no cabía.
- 1.32–1.78 · Hairline.
- 1.58–3.22 · Los tres hechos, uno cada 0,64s: la asunción del cargo en enero, el puente de 180 días, y **"Ese plazo ya venció."** en `--foreground` (el único en peso fuerte, porque cierra el argumento).
- 3.30–6.40 · La quietud más larga de la pieza. Tres datos institucionales necesitan leerse dos veces.

## Frame 10 — La pregunta de fondo

- scene: "¿es sostenible un acuerdo a 100 años sin elecciones a la vista?" sobre --surface
- duration: 4.0s
- poster: 3.0s
- transition_in: cut
- status: animated
- voiceover: "¿Es sostenible un acuerdo a cien años sin elecciones a la vista?"
- src: compositions/frames/10-sostenible.html
- blueprint: titlecard-reveal
- focal: "la pregunta en tres líneas"
- roles: "ninguno — registro --surface, tipografía sola"

Aquí se juntan las dos mitades del video: el plazo del frame 3 y la legitimidad del
frame 8. **Es una pregunta, no una acusación**, y por eso funciona: el dato ya está
puesto y quien la contesta es el lector.

Va sobre `--surface`, un registro intermedio: es el escalón entre los frames oscuros
y el acento del cierre, y avisa de que ya no estamos enumerando datos.

**Shot sequence**

- 0.00–0.28 · La superficie `--surface` sube desde abajo, mismo gesto que traerá el acento del cierre.
- 0.36–1.84 · Tres golpes, uno por línea, con entradas distintas: **"¿es sostenible"** (slam) / **"un acuerdo a 100 años"** (side-snap) / **"sin elecciones a la vista?"** en `--accent` (rise-rotate).
- 1.82–2.36 · Hairline + "Todavía no hay fecha electoral anunciada."
- 2.40–3.00 · Quietud. La pregunta se queda sola.

## Frame 11 — Y a mí qué

- scene: "¿y esto mueve la tasa?" sobre --accent pleno + firma de La Tasa
- duration: 3.6s
- poster: 2.6s
- transition_in: cut
- status: animated
- voiceover: "¿Y esto mueve la tasa? Nadie lo ha dicho todavía. Aquí lo vas a ver primero."
- src: compositions/frames/11-cierre.html
- blueprint: titlecard-reveal
- focal: "«¿y esto mueve la tasa?»"
- roles: "ninguno — registro de acento pleno, tipografía sola"

La segunda pregunta, y la que le importa al lector de La Tasa. Se deja abierta a
propósito: no hay dato oficial sobre el efecto en la tasa y esta app no inventa
números.

**Shot sequence**

- 0.00–0.26 · Corte al registro `--accent` pleno, que sube desde abajo heredando el gesto del frame anterior.
- 0.29–1.10 · **"¿y esto mueve / la tasa?"**, un golpe por línea.
- 1.10–1.46 · "Nadie lo ha dicho todavía." al 55% de `--background`.
- 1.62–2.14 · Firma: rule de 36×2px + "LA TASA · @latasa.online".
- 2.15–3.00 · Quietud hasta el final. Es el último frame: nada sale de cuadro.

## Video direction

**Paleta.** Los tokens de La Tasa (`ESTILOS.md` §2), sin un solo color crudo:
`--background` #0b1120 de fondo, `--surface` #131c2f en el frame 9, `--foreground`
#f1f5f9 en el texto, `--muted` #94a3b8 en etiquetas y letra chica, `--border`
#26324c en los hairlines y `--accent` #34d399 en toda cifra y todo kicker.
`--warning` #fbbf24 **no se usa**: en este sistema es semántico —"este número no es
de fiar ahora mismo"— y aquí sería decorativo, que es justo lo que la norma prohíbe.
Tipografía: Geist Sans, la única familia del proyecto (`ESTILOS.md` §3).

**Registro, en tres escalones.** Ocho frames sobre `--background`, el noveno sobre
`--surface` y el décimo sobre `--accent` pleno con texto `--background`. La
superficie sube un peldaño cada vez que el video cambia de registro narrativo: de
enumerar datos, a preguntar, a firmar. El acento a pantalla completa es la única
libertad respecto de la app, donde nunca cubre una superficie entera: en un Reel el
último plano es la firma de marca.

**Una cifra por frame.** Tres frames seguidos de números —65.000, 100, 55 %— solo
funcionan si cada uno tiene el suyo y nada más. En cuanto dos cifras comparten
pantalla, ninguna se recuerda. El "17 campos" del frame 5 es la excepción y por eso
llega **después** de que la lista de petroleras ya asentó, no junto a ella.

**Cada dato dice de dónde viene.** Las promesas están atribuidas ("SEGÚN MARCO
RUBIO"), lo que no se ha revelado se dice que no se ha revelado, y lo que aporta un
periodista se le atribuye por su nombre. Es la misma regla que rige las tarjetas de
tasas en la app.

**La marca va en las once pantallas.** Arriba a la derecha, taza + "La Tasa"
(`m<NN>-marca`, logo de `assets/logo-latasa.png`). Entra con el frame, a 0.02s, y se
queda: es identidad, no un elemento narrativo, así que nunca compite con un golpe.
El mismo criterio que el sello de los videos marcados en Cloudinary — si alguien
descarga el Reel y lo reparte suelto, la cuenta viaja con él. En el registro de
acento (frame 11) el nombre va en `--background`; en el resto, en `--foreground`.

**Fotografía: cinco desaturadas y una de portada.** Las fotos de fuente
(`mapa-venezuela`, `petroleo`, `bandera-usa`, `rubio`, `delcy`) van todas iguales:
desaturadas del todo y con velo `--background` entre 40% y 68%, para que ninguna
compita con la tipografía y para que se lean como un mismo sistema pese a venir de
fuentes distintas.

`portada.jpg` es la excepción y por eso vale la regla: **no es una foto de fuente,
es una composición** —dos banderas, tres retratos y el pozo— armada para abrir el
video. En blanco y negro pierde justo lo que la hace legible de un vistazo, así que
va a **media saturación** (0.45 en el gancho, 0.30 en el puente) con velo pesado
abajo. Que sea la única con color también hace algo útil: separa la apertura del
bloque de datos, que empieza en el frame 3.

**Corriente.** Todo el video empuja hacia adelante: cada frame hereda un push de
cámara del anterior (escala creciente, nunca pull-back), y los cortes son duros
—sin crossfade— porque es una noticia, no un ensayo. Las únicas excepciones son los
dos wipes verticales de los frames 9 y 10, que comparten gesto justamente para que
el remate se lea como un solo movimiento.

**Quietud antes del corte.** Cada frame termina con 0.4–1.1s de calma total. Con
diez frames y treinta y tres segundos, sin esa calma el video se lee como un
listado y no queda ni una cifra.

**Tipografía.** Un solo momento display por frame. Las cifras siempre en `--accent`,
el texto de apoyo en `--foreground`, la letra chica en `--muted`. Nada de signos de
exclamación: la urgencia la carga el tamaño, no la puntuación — y en un video que
cita a Trump, cuyo comunicado va en mayúsculas y con exclamaciones, la contención
tipográfica es también una posición editorial.

**Sin locución generada.** El proyecto no usa TTS. El video se entrega mudo y
autosuficiente —se entiende sin sonido, que es como se ve un Reel—; el guion de voz
queda en `GUION.md` para grabarlo aparte si se quiere.
