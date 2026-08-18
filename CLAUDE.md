<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# La Tasa

Tasas del día y calculadora de conversiones cruzadas para la frontera
colombo-venezolana. Se usa de pie, en un negocio, en un teléfono y con señal
intermitente: esa es la vara con la que se mide cualquier decisión de diseño.

Todo se escribe en español: interfaz, comentarios, mensajes de commit y README.

## El modelo mental

Cada moneda tiene un precio en bolívares (`bsPerUnit`). El bolívar es el pivote de
**todas** las conversiones:

```
bs            = monto × tasa(origen)
monto_destino = bs ÷ tasa(destino)
```

Basta con conocer ese número por moneda para cruzar cualquier par. Si algún día se
añade una moneda, lo único que hace falta es su precio en bolívares.

Sin carpeta `src/`: `app/`, `components/`, `lib/`, `public/` y `scripts/` cuelgan
de la raíz, y el alias `@/*` resuelve desde ahí.

## Decisiones y su porqué

### Las APIs del documento original no funcionan

El proyecto nació de un PDF con endpoints sugeridos. Se verificaron uno a uno y
**ninguno de los principales servía**: `bcv.today` da 404, `bcvapi.tech` pasó a
exigir registro, `v6.exchangerate-api.com` exige clave y Frankfurter ni siquiera
cubre COP ni VES. Las fuentes que se usan en su lugar están en el README con el
motivo del descarte de cada una. No las restaures pensando que fue un descuido.

### El peso tiene dos precios y no son intercambiables

`COP_OFICIAL` cruza las dos tasas de papel: dólar BCV ÷ TRM del Banco de la
República. `COP_FRONTERA` cruza los dos mercados P2P de Binance (VES ÷ COP) y es
lo que de verdad se paga; suele ir más de un 10 % por encima. Mostrar solo uno
daría una imagen falsa del mercado, y por eso conviven en la interfaz.

El de frontera es una **aproximación**: no existe API pública de las casas de
cambio de Cúcuta. Está construido para ser verificable contra fuentes reales, pero
no es una cotización en firme y la interfaz no debe presentarlo como tal.

### El BCV se lee raspando su portada

Es la única fuente gratuita verificada que publica el **euro oficial**; las APIs de
terceros que lo ofrecían cerraron o pasaron a exigir registro. Tres detalles de
`lib/providers/bcv.ts` que costó encontrar:

- Su certificado TLS está vencido, así que la petición va con `node:https` sin
  validarlo, acotado exclusivamente a ese host.
- Node no aplica `HTTPS_PROXY` por su cuenta. Cuando la variable existe hay que
  abrir el túnel `CONNECT` a mano, o la petición falla sin explicación.
- El bloque `<div id="dolar">` tiene divs anidados, de modo que buscar su cierre
  se detiene antes del valor: la expresión regular se ancla al primer `<strong>`
  posterior al identificador.

Si el HTML del BCV cambia, se cae al respaldo de `ve.dolarapi.com`, que solo trae
el dólar. El euro queda sin dato y `/api/health` dice por qué.

### Lo que se muestra es lo que se calcula

`bsPerUnit` llegaba al snapshot con la precisión completa del proveedor (BCV,
TRM del Banco de la República, Binance), pero al usuario se le muestra
redondeado (`formatRate` en `lib/format.ts`: 4 decimales si la tasa vale menos
de 1 Bs, 2 en el resto). `convert()` calculaba con el valor sin redondear, así
que alguien que reproducía la cuenta a mano con el número que veía en pantalla
—p. ej. 100 $ ÷ 0,2328 Bs por peso— obtenía un resultado distinto al de la
app: verificado en vivo, 323.063 COP en la calculadora frente a 323.065
calculado a mano con la tasa de 4 decimales.

La corrección no vive dentro de `convert()`: redondear ahí solo arreglaría esa
función y dejaría inconsistentes el inverso de `RatePanel` y los valores
crudos de `/api/rates/*`, que son otros sitios donde alguien puede reproducir
la cuenta. En cambio, `bsPerUnit` se redondea una sola vez, en `buildRate()`
(`lib/rates.ts`), su único punto de entrada al snapshot, con
`roundToDisplayPrecision()` (`lib/format.ts`). Así todo lo que lee `bsPerUnit`
después parte del mismo número que ve el usuario.

La tarjeta del peso además muestra el inverso ("1 Bs = X pesos"). Con los 2
decimales de `formatRate` esa cifra no es la inversa matemática real de una
tasa de 4 decimales (0,2328 Bs/peso ⇄ 4,30 pesos/Bs difieren ~0,1 %), así que
multiplicar por la inversa mostrada no daba el mismo resultado que dividir por
la tasa mostrada. Por eso existe `formatInverseRate()`, con 6 decimales: no es
una precisión arbitraria, es la mínima para que ambos caminos coincidan en los
montos con los que de verdad se usa la app. Ninguna cantidad finita de
decimales lo garantiza para montos arbitrariamente grandes —es una limitación
matemática de mostrar dos números redondeados por separado, no algo que haya
que seguir afinando.

### Las fechas se arman a mano, no con `Intl.DateTimeFormat`

Servidor y navegador pueden traer versiones distintas de ICU y devolver textos que
no coinciden —"12:00 a. m." frente a "12:00 a.m."—, lo que **rompía la
hidratación**. En `lib/format.ts` se construyen a mano en hora de Caracas, que es
UTC−4 todo el año desde 2016. Los números sí usan `Intl.NumberFormat`, que no dio
problemas.

Se muestran en lenguaje llano ("hace 3 horas") porque la pregunta real del usuario
es si el número sigue sirviendo. El BCV publica la fecha valor del **día
siguiente**, así que el formateador contempla el futuro y dice "vigente mañana".

### El estado del navegador se lee con `useSyncExternalStore`

La conexión y la posibilidad de instalar son estado externo a React. Leerlos con
`setState` dentro de un efecto dispara el linter de React y complica la
hidratación; `useSyncExternalStore` además permite declarar un valor distinto para
el servidor, que es lo que evita el desajuste.

### Hay tres cachés y cada una resuelve algo distinto

| Dónde | Alcance | Para qué |
| --- | --- | --- |
| Memoria (`lib/cache.ts`) | Una instancia, 5 min | Que dos visitas seguidas no consulten dos veces |
| CDN (`s-maxage=60`) | Todos los usuarios | Que el tráfico no llegue a las fuentes |
| Service worker | Un dispositivo | Que la app abra sin conexión |

Lo que hay que respetar:

- **El service worker nunca cachea `/api/`**. Una tasa vieja servida como fresca
  es el único daño real que esta app puede causar.
- La portada y las rutas API tienen **instancias de caché en memoria separadas**;
  en Vercel, además, cada función tiene la suya. Por eso el botón "Actualizar
  tasas" navega a `?actualizar=<marca>`: sin un parámetro que cambie, la página
  volvería a leer su propia caché y el botón no haría nada.
- Next fuerza `no-store` en las páginas dinámicas, así que la cabecera de caché de
  la portada se pone desde `next.config.ts`. Si tocas eso, comprueba que Next siga
  emitiendo `Vary` sobre las cabeceras RSC: sin ese `Vary`, la CDN devolvería HTML
  donde el navegador espera la carga de navegación interna.

### El service worker precarga al instalarse

Sin ello la app abría **en blanco** sin conexión: en la primera visita todavía no
gobierna las peticiones, así que la navegación que la trae no pasa por él y no se
guarda nada. Los nombres de los archivos de Next llevan un hash que cambia en cada
compilación, de modo que se leen del propio HTML en lugar de mantener una lista
fija que quedaría obsoleta al primer despliegue.

`VERSION` en `public/sw.js` se sube **a mano**: si cambias la estrategia y no lo
haces, quedan copias viejas colgadas en los dispositivos.

### La tasa Binance es una operación de referencia, no el mejor anuncio

El precio del mejor anuncio sin filtrar **no es representativo**: en Binance P2P la
tasa cambia según el monto (los anuncios tienen límites min/max) y, en VES, según el
método de pago. Por eso `lib/providers/binance.ts` no usa el listado sin filtrar:
primero hace un fetch de sondeo (sin filtros) para tener un precio aproximado, y con
él calcula cuánto vale en moneda local una operación de referencia
(`BINANCE_REFERENCE_USD_AMOUNT` dólares, default 100; en VES además vía
`BINANCE_REFERENCE_PAY_TYPE`, default Pago Móvil). La tasa final es la mediana
recortada de los anuncios que cubren esa operación. Si el filtro no trae anuncios
(poca liquidez con ese monto/método), cae al precio de sondeo en vez de romper el
fetch — no lo cambies a lanzar un error ahí, es degradación intencional.

En COP solo se filtra por monto: no hay un identificador de método de pago
colombiano verificado, así que forzar uno arriesga vaciar el resultado sin
necesidad.

Compra y venta ya no se promedian en una sola tasa: son dos `RateKey`
independientes (`USD_BINANCE_BUY` / `USD_BINANCE_SELL`), porque la diferencia entre
ambas es real (verificado en vivo: ~847 vs ~838, más de un 1 %) y esconderla en un
promedio daba una imagen falsa de lo que se paga o se recibe. `BinanceDetail.mid`
se conserva porque `COP_FRONTERA` lo sigue usando para el cruce VES↔COP.

### El post diario es un carrusel: bolívares y pesos

El post en bolívares responde "cuánto vale un dólar en bolívares", que es la
pregunta del lado venezolano. Del lado colombiano la pregunta es la contraria, así
que el post diario es un **carrusel de dos diapositivas**: bolívares primero,
pesos después.

- Un carrusel y no dos publicaciones seguidas. Cuatro posts casi idénticos al día
  saturan el feed y la cuadrícula del perfil, y el post en pesos es el complemento
  del de bolívares, no una noticia aparte. Además un carrusel sale entero o no
  sale: con dos publicaciones puede quedar la primera publicada y la segunda no, y
  entonces reintentar duplica la que sí funcionó.
- El caption es **uno solo** (el del contenedor padre) y lleva los dos bloques de
  cifras. No quites el de pesos pensando que ya está en la segunda diapositiva: esa
  solo se ve si el lector desliza, y en el caption los números se leen, se copian y
  se buscan sin deslizar nada.
- `publishCarouselPost` crea los hijos **en paralelo** a propósito: crear un
  contenedor es lo que hace que Meta se descargue la imagen, y las nuestras se
  renderizan al vuelo. Por eso mismo el route del cron exporta `maxDuration = 60`:
  son cuatro viajes a Meta más los reintentos del código 9007.
- Las filas viven en `lib/pesos.ts` y las leen tanto la imagen como el caption. No
  las dupliques en cada sitio: son el mismo post y tienen que decir lo mismo.
- Todo se calcula con `convert()`, no a mano, para que el número publicado sea el
  mismo que da la calculadora. La única excepción es el **dólar TRM**, que se toma
  de `snapshot.trm` tal cual: derivarlo de `USD_BCV ÷ COP_OFICIAL` daría lo mismo
  por construcción, pero con dos redondeos encima sobre una cifra oficial que el
  lector puede contrastar con el Banco de la República.
- El **bolívar promedio** es el promedio del dólar frontera de compra y venta
  expresado por bolívar, y eso se simplifica a `1 ÷ COP_FRONTERA`: ambas filas de
  frontera dividen entre la misma tasa, así que el promedio se cancela. No lo
  "corrijas" a un promedio explícito — daría el mismo número con más redondeos por
  el camino.
- Las cifras en pesos usan `formatRate` como todo lo demás, o sea 2 decimales.
  Hubo un `formatCopRate` con 4 decimales por debajo de 100 y **se retiró a
  propósito**: en una lista de miles, un `4,2955` junto a un `3.640,46` se lee
  de reojo como "cuatro mil y algo". El costo asumido es que el bolívar sale
  `4,30 COP` mientras que invertir el `0,2328 Bs` de la otra diapositiva da
  `4,2955`; en una imagen que se mira de pasada pesa más que se lea bien que
  que cuadre al cuarto decimal. Si lo reintroduces, vuelve el problema.
- Las filas de **frontera declaran su fuente** ("Binance P2P") debajo del
  nombre: peso frontera en la diapositiva de bolívares, y los dos dólares
  frontera más el bolívar promedio en la de pesos. Sin eso el lector las
  atribuye a las casas de cambio de Cúcuta, que es justo lo que la app tiene
  prohibido sugerir — no existe API pública de esas casas y el número es una
  aproximación sobre Binance. Las demás filas no la llevan porque su nombre ya
  la dice ("Dólar BCV", "Dólar Binance", "Dólar TRM"). El texto se lee de
  `rate.source`, no se escribe a mano.
- El pie del caption enlaza tres sitios —el post del día, la calculadora y el
  canal de WhatsApp— con URLs reales, no "link en la bio". Ver la sección de
  abajo sobre `/p/<slug>`: el mismo mecanismo lo comparte con los posts de
  noticia.

### Cada post enlaza al post, a la calculadora y al canal — con `/p/<slug>`

Todo caption que no sea el reporte semanal termina con el mismo pie de tres
enlaces (`pieEnlaces()` en `lib/caption.ts`):

```
📲 ¿Quieres ver la publicación de hoy con las tasas actualizadas?
👉 <enlace del post>

🧮 Calculadora de divisas completa:
👉 <SITE_URL>

📢 Únete a nuestro canal oficial de WhatsApp:
👉 <SITE_URL>/wa
```

El bloque del canal se omite si `ENLACE_WHATSAPP` no está configurado, mismo
criterio que ya usaba `enlaceWhatsapp()` para la ruta `/wa` — no publicar un
enlace que no lleva a ningún sitio.

- **El enlace del post nunca es el permalink directo.** El caption se manda a
  Meta *antes* de publicar, y el permalink (`instagram.com/p/…`) no existe
  hasta después — Instagram no deja editarlo luego. El post diario ya
  resolvía esto con `/hoy`: un atajo que se escribe en el caption de
  antemano y se anota después de publicar. `/p/<slug>` (`app/p/[slug]/page.tsx`,
  `lib/enlaces.ts`) generaliza esa misma idea a los posts de noticia, que
  —a diferencia del diario— no tienen una sola ruta fija: puede salir más de
  uno el mismo día. `generarSlugPost()` da un slug opaco de 8 caracteres
  (`randomBytes(6)` en base64url) antes de publicar; `anotarEnlacePost()` en
  `lib/publish-news.ts` anota el permalink real después, en un `try/catch`
  tragado y aparte de la publicación — mismo motivo que `/hoy`: el post ya
  está en la cuenta, y un fallo al anotar el enlace no puede convertir una
  publicación correcta en un error que invite a duplicarla. Si falla, o si
  alguien abre el enlace en el instante entre publicar y anotarlo,
  `destinoDePost()` cae al perfil de Instagram — no hay variable de entorno
  de respaldo como `ENLACE_HOY`, porque no tiene sentido una para un slug que
  no existía hasta ese post en concreto.
- **`/p/[slug]/page.tsx` es una página con `<meta refresh>`, no una
  redirección 307** — igual que `/hoy` y por el mismo motivo: este enlace
  viaja en el mensaje que se pega en el canal de WhatsApp, y el rastreador que
  arma la vista previa sigue una redirección de servidor hasta Instagram,
  donde se encuentra el muro de login sin `og:image`. La tarjeta tiene que
  salir de este dominio. A diferencia de `/hoy`, no lleva una imagen propia de
  vista previa (evita otra vuelta de columnas en Supabase); es una tarjeta
  genérica de "La Tasa".
- **El pie se agrega en un solo sitio para los cuatro tipos de post**
  (articulo, manual, carrusel, reel): `conEnlacePost()` en
  `lib/publish-news.ts`, llamada exactamente una vez por publicación real —al
  ejecutarla de un tirón (`ejecutarPublicacion`) o al congelarla para la cola
  (`materializarParaProgramar`). Ninguna función de caption (`buildNewsCaption`,
  ni el `caption` que el admin teclea a mano en `/admin/noticia` para
  manual/carrusel/reel) lo incluye por su cuenta: así no hay que duplicar la
  lógica del pie ni el criterio de cuándo omitir el canal en cada plantilla.
  `conPieEnlaces()` quita cualquier pie anterior antes de poner uno nuevo
  (busca el bloque que empieza con la primera línea del pie), así que se
  puede llamar de nuevo sobre un caption editado sin ir acumulando pies.
- **Para el post diario y `articulo` con `captionOverride`, el pie también se
  agrega siempre**, sin excepción — a diferencia de los hashtags que llevaba
  antes el caption de noticia, que si el admin sobreescribía el texto
  desaparecían con él. Se decidió así por simplicidad: un caption sin estos
  tres enlaces es la excepción que nadie pidió, y mantener dos comportamientos
  distintos según haya o no `captionOverride` habría sido más código para un
  caso que no vale la pena.
- **La cola de programadas necesita el slug de vuelta.** `avanzarPublicacion()`
  en `lib/worker-programadas.ts` obtiene el `mediaId` en un disparo del cron
  que puede ser horas después de haberse programado, así que el slug generado
  al congelar el payload viaja dentro de él (`PublicacionPayload.slugEnlace`,
  un campo más del JSON, sin migración) para que ese disparo sepa bajo cuál
  anotar el permalink. `articulo` no lo lleva: nunca llega a la cola —
  `materializarParaProgramar` lo convierte en `manual` antes de guardarlo—, y
  resuelve su propio slug dentro de `prepararPublicacion()` en el momento de
  publicar, porque solo ahí se sabe si hubo `captionOverride`.
- El service worker deja pasar `/p/` **por prefijo** y no por ruta exacta como
  el resto de `ATAJOS` en `public/sw.js`, porque cada post tiene su propio
  slug. Al tocar eso se sube `VERSION`, igual que con cualquier cambio de
  estrategia.

### El reporte semanal necesita memoria, y de ahí sale el histórico

Además de los dos posts diarios, hay un **reporte semanal** ("Así se movieron las
tasas esta semana") con tres tarjetas: dólar BCV, brecha BCV/Binance y TRM, cada
una con su valor y **cuánto se movió en siete días**. Se dispara a mano desde
`/admin/semanal`, nunca por cron: sale una vez por semana y conviene mirarlo antes.

- **Hasta aquí la app solo conocía el presente.** La variación obligó a guardar
  algo, así que existe `historico_tasas` (migración `0004`) y `lib/historico.ts`.
  El registro lo hace el **cron de tasas**, justo después de `getRates()`, en un
  `try/catch` tragado y aparte del `try` que publica: si fuera dentro, un Supabase
  caído convertiría una publicación correcta en un 500 que invita a reintentar y
  duplica el post. Es el mismo criterio que `guardarEnlace` y `calentarVideo`.
  No lo muevas a `getRates()` ni a `/api/rates`: ahí sería una escritura por
  visitante.
- **Una fila por `(fecha, clave)`, no un JSON por día.** La pregunta que se le
  hace a la tabla es siempre "cuánto valía X alrededor del día D", y los huecos
  son por clave y no por día —el BCV se raspa y puede caerse mientras Binance
  responde—. Con un JSON habría que traer la semana entera y desenrollarla para
  descubrir que justo esa clave venía nula. La clave primaria es lo que hace
  idempotente el upsert: el cron dispara dos veces al día y el segundo disparo
  **pisa** al primero, así que lo guardado es el último dato conocido de la
  jornada. Verificado en vivo: dos escrituras, una sola fila.
- **La ventana de tolerancia es simétrica** (±3 días). Si el cron falló el lunes
  pero corrió el martes, ese dato sirve y está más cerca que el del viernes
  anterior. En empate gana la fecha más antigua, para que la comparación no se
  acorte por debajo de la semana. No la amplíes a diez días: entonces "esta
  semana" deja de ser una semana.
- **Sin dato, la clave no aparece en el `Map`.** Nada de `valor: null` ni
  centinelas: quien consume tiene que distinguir "no hay comparación" de "el valor
  era cero". En la imagen eso se ve como `Sin comparación` en gris, sin flecha y
  sin cifra — nunca un `0,0 %` ni un guion suelto.
- **La brecha se mide contra `USD_BINANCE_SELL`, no contra el `mid`.** Compra y
  venta dejaron de promediarse por lo explicado más arriba, y `mid` sobrevive solo
  para el cruce de `COP_FRONTERA`. Una tarjeta que dice "brecha" tiene que nombrar
  un lado del mercado, y el que responde a la pregunta del lector —cuánto pago de
  más— es la venta. Los dos extremos de la comparación se calculan con las mismas
  dos claves: si falta cualquiera en el histórico, no hay brecha anterior.
- **La variación de la brecha va en puntos porcentuales, no en porcentaje.** La
  brecha ya *es* un porcentaje. De 30,1 % a 34,2 % son `+4,1 pp`, que es lo que se
  lee en las dos cifras; en relativo sería `+13,6 %`, un número que no aparece en
  ninguna parte de la tarjeta y que se confundiría con la brecha misma. De ahí
  `unidadVariacion` en `lib/semanal.ts`.
- **El color va por impacto y la flecha por signo.** Sube → rojo, baja → verde:
  una tasa que sube es una devaluación para quien lee, y pintarla de verde por ser
  un número mayor daría el mensaje contrario. `lib/semanal.ts` solo expone
  `direccion`; el mapa a color vive en la ruta, con los demás colores.
  `formatVariacion` devuelve la **magnitud absoluta** justamente porque el signo ya
  viaja en la flecha.
- **La imagen va sin firma HMAC**, al contrario que `instagram-post-news`. El
  criterio no es quién la llama sino si recibe texto controlable por quien arme la
  URL: aquella lo lleva porque el titular viaja por query; esta no recibe ni un
  carácter libre —lee las tasas y el histórico del servidor— y sus únicas entradas
  son dos enums. Firmarla añadiría los 403 por conjunto desajustado sin cerrar
  nada.
- **Dos lienzos: 1:1 para el feed y 9:16 para Story.** Los 840 px de diferencia
  **no se reparten proporcionalmente**: en una Story, Instagram superpone su
  interfaz arriba y abajo, así que el vertical lleva reservas (110 y 130 px) y lo
  que caiga ahí queda tapado. Los 104 px de la variación que pedía el diseño solo
  caben en vertical (y ahí bajan a 76); en el cuadrado, a ese tamaño se perdían la
  tercera tarjeta y el pie entero.
- **La Story no se publica desde la app, se descarga.** Una Story por la Graph API
  no admite sticker de enlace ni texto, que es lo que la hace útil. El botón baja
  el PNG con `?descargar=1` —por cabecera, no con el atributo `download`, que en
  iOS es poco fiable— y se sube a mano.
- **El reporte semanal no se puede programar**, y `materializarParaProgramar` lo
  rechaza explícitamente. La regla del proyecto es que el post se congela al
  programarlo, y este resuelve su imagen al publicar leyendo las tasas del
  momento: programado saldría con cifras distintas de las previsualizadas. La
  variante `{ tipo: "semanal" }` del payload existe solo para que el botón
  inmediato pase por `ejecutarPublicacion()`, que es la puerta única.
- **El caption abre con el movimiento más fuerte**, no con el titular de la
  imagen. Instagram corta el texto tras ~125 caracteres, así que esa primera
  línea es lo único que se lee sin pulsar "más", y repetir ahí lo que ya se lee
  enorme en la imagen es desperdiciarla. **Solo compiten filas de la misma
  unidad**: un `%` y un `pp` no son magnitudes comparables, así que la contienda
  es entre el dólar y la TRM, y la brecha encabeza únicamente si es la única con
  comparación. Elegir por el número más grande a secas haría ganar casi siempre
  a la brecha, que se mueve en otra escala. Sin ninguna comparación se cae al
  titular de la imagen. De ahí `sujeto` en `FilaSemanal`: `titulo` es una
  etiqueta de tarjeta y no encaja dentro de una oración.
- Los `pp` se explican **pegados a su propio número** y no en un párrafo aparte,
  y el rango de fechas va entre paréntesis: la frase ya lleva un guion largo
  dentro ("Lunes 10 — Domingo 16") y encadenar dos se lee fatal.
- **Tampoco toca `/hoy`**: "el post del día" es el de tasas.
- Los primeros siete días no hay con qué comparar. La imagen sale igual —los
  valores actuales no dependen del histórico— con `Sin comparación` en las tres
  tarjetas y una línea bajo la cabecera que lo dice. Desaparece sola al octavo
  día. Se puede ver sin esperar con
  `npx tsx scripts/preview-semanal.ts --sin-historico`; ese flag vive **en el
  script y nunca en la ruta**, porque un parámetro que falsea datos en una URL
  pública es justo lo que la ausencia de firma no debe permitir.

### Los crons ya no son de Vercel, y por eso hay cola de programadas

Un post de `/admin/noticia` se puede dejar en cola para que salga a cierta hora.
La Graph API de Instagram no programa publicaciones de feed, así que la cola
vive aquí.

- **Los tres disparos están en cron-job.org**, no en `vercel.json`, que quedó sin
  `crons`. El motivo no es el número de slots del plan Hobby sino la frecuencia:
  ahí **cada cron solo se ejecuta una vez al día**, lo que no sirve para mirar
  una cola cada pocos minutos. El de la cola va **cada 2 minutos**, no cada
  diez: con la publicación repartida en fases (ver más abajo), un intervalo
  largo multiplicaría la espera por el número de fases. Y de paso se arregló algo que pasaba
  desapercibido: los crons de Hobby disparan "dentro de la hora", así que el
  post de tasas de las 9:00 podía salir a las 9:50. Si los devuelves a
  `vercel.json`, las programadas dejan de salir.
- **El post se congela al programar, no al publicar**
  (`materializarParaProgramar` en `lib/publish-news.ts`). `publishNewsPost`
  vuelve a scrapear el artículo cuando publica, que para el botón inmediato da
  igual pero para algo que sale dentro de seis horas no: el portal puede editar
  el titular, cambiar la foto o caerse. Se resuelve todo por adelantado y la
  foto se copia a Cloudinary con `subirDesdeUrl()`, de modo que lo guardado es
  siempre un payload autocontenido. No lo cambies a guardar la URL y scrapear
  al final: rompe la regla de que lo que se muestra es lo que se publica.
- **Publicar al instante y publicar programado pasan por la misma puerta**,
  `ejecutarPublicacion()`. Si divergen, lo que sale a la hora programada deja
  de ser lo que se probó con "Publicar".
- **El reclamo de la cola es atómico y ahí está el riesgo real**
  (`reclamarVencida` en `lib/programadas.ts`). El `estado=eq.pendiente` del
  filtro se traduce en un `WHERE` sobre el `UPDATE`: si dos disparos se
  solapan, solo uno se lleva la fila. Sin esa condición el modo de fallo es un
  post duplicado en la cuenta real, que no se deshace. Por lo mismo,
  cron-job.org va **sin reintentos automáticos**: el reintento vive en la
  propia cola, que sí sabe por dónde iba.
- **La publicación va por fases, y no de un tirón.** Un carrusel con video no
  cabe en una sola petición: Meta procesa cada contenedor de forma asíncrona y
  hay que sondearlo, lo que puede llevar minutos, mientras que una función de
  Vercel muere al minuto y cron-job.org da por fallida cualquier respuesta que
  pase de 30 segundos. Verificado en producción: una programada de las 9:30 con
  imagen + video murió a mitad, y como el `catch` del route nunca llegó a
  correr, `cerrarProgramada()` tampoco: la fila se quedó en `publicando` sin
  publicarse y sin poder reintentarse.

  Ahora `avanzarPublicacion()` (`lib/worker-programadas.ts`) hace un trozo
  acotado —20 s de presupuesto— y **anota la fase en la fila**
  (`creando → esperando_hijos → esperando_padre → publicando_meta`), de modo
  que el disparo siguiente retoma donde se quedó. Al terminar el turno suelta
  la fila (`liberarProgramada`) para que la retomen enseguida; el margen de
  abandono de 90 s es solo para las ejecuciones que mueren sin soltarla.

  No subas el presupuesto pensando que así termina antes: lo que lo limita no
  es nuestro código sino los 30 s que espera cron-job.org por una respuesta.
- **`publicando_meta` es la única fase que no se retoma sola.** Es el
  `media_publish`, el único paso irreversible: crear contenedores o sondear
  estados se puede repetir sin consecuencias —un contenedor de más caduca
  solo—, pero reintentar la publicación podría duplicar el post. Las que mueran
  ahí se quedan visibles en la cola para decidirlas a mano, que es el lado
  seguro del error.
- **El botón "Publicar ahora" y el cron son el mismo worker**, por el mismo
  motivo que `ejecutarPublicacion()`. El botón tampoco publica de una sola
  llamada: pide un paso, muestra la fase en lenguaje llano y vuelve a pedir
  otro. Si se cierra el navegador a mitad, el cron la termina igual.
- **Una `fallida` se puede reintentar o eliminar desde la cola**; una
  `publicando` no. Esa puede haber llegado a Meta, y borrar la fila perdería el
  único rastro de qué salió y qué no.
- **A una `pendiente` se le puede cambiar la hora sin rehacer el post**
  (`reprogramarPublicacion`). Solo se mueve `publicar_en`: el payload se congeló
  al programar y sigue valiendo, así que no hay que volver a materializar nada.
  El `estado=eq.pendiente` del filtro cumple aquí el mismo papel que en
  `reclamarVencida` —viaja al `WHERE` del `UPDATE`—: si el worker reclamó la
  fila mientras se elegía la hora nueva, el `PATCH` no encuentra nada y contesta
  409 en vez de moverle la hora a algo que ya está saliendo. Una `fallida` no se
  reprograma: para esa está "Publicar ahora".
- **Cada fila de la cola muestra un fragmento de su título**
  (`resumenPublicacion`). Dos posts programados con pocos minutos de diferencia
  se veían idénticos —solo su hora—, y cancelar o mover el equivocado era
  cuestión de suerte. El `reel` es el único que no tiene título propio: se
  identifica por la primera línea de su caption. El recorte a 60 caracteres
  acota lo que viaja al navegador, no lo que se ve: de ajustar al ancho se
  encarga `truncate`, y por eso no hay un número de caracteres en la interfaz.
- **El video se calienta al programar** (`calentarVideo`, en
  `lib/publish-news.ts`). La marca del video es una transformación por URL: la
  primera petición transcodifica el clip entero. Si esa espera cae dentro de la
  publicación se le suma al procesamiento de Meta, así que se paga por
  adelantado, al programar, donde no hay prisa. Si falla, se ignora: es una
  optimización, no un requisito.
- La tabla lleva **RLS activada y ninguna política**, así que solo la
  `service_role` la ve. El navegador nunca habla con Supabase: todo pasa por
  las rutas `/api/admin/*`, que ya exigen la cookie de sesión.
- La hora se escribe y se lee **en Caracas** (`isoDesdeHoraCaracas`), no en la
  del dispositivo: desde Cúcuta el teléfono va en UTC−5 y un post "de las 7"
  saldría corrido.
- La cola la lee la **página en el servidor** y baja por props. Pedirla desde
  el cliente obligaba a un `setState` dentro de un efecto, que es el patrón que
  el proyecto evita (mismo motivo que `useSyncExternalStore` más arriba) y que
  el linter rechaza.

### `/hoy` es una página, no una redirección

Tres atajos del dominio para compartir: `/hoy` al carrusel de tasas del día, `/ig`
al perfil y `/wa` al WhatsApp. Los dos últimos sí son `redirects()` de
`next.config.ts`, que es lo idiomático. `/hoy` no, y por dos motivos distintos que
conviene no confundir:

- **`redirects()` se evalúa al compilar.** El destino de `/hoy` cambia dos veces al
  día y en Vercel un cambio de variable de entorno solo entra con un despliegue
  nuevo, así que ponerlo ahí obligaría a redesplegar cada mañana y cada tarde. En su
  lugar lo anota el propio cron: tras publicar el carrusel pide el permalink a Meta
  (`permalinkDeMedia`) y lo guarda en la tabla `enlaces` (`lib/enlaces.ts`).
- **Una redirección se queda sin vista previa.** Este enlace se pega en WhatsApp, y
  su rastreador sigue el 307 hasta Instagram, donde encuentra el muro de login: sin
  `og:image` la tarjeta sale vacía. Por eso `app/hoy/page.tsx` declara sus propias
  etiquetas Open Graph, con la imagen que ya genera `/api/og/instagram-post` —la
  misma que se publicó, no una compuesta aparte—, y manda al visitante con un
  `<meta http-equiv="refresh">`. El rastreador no lo ejecuta y se queda con la
  tarjeta; la persona ve un parpadeo. El `refresh` va en HTML y no en un script
  para que funcione también sin JavaScript, y debajo queda un enlace visible por si
  el navegador bloquea la redirección.

Lo demás que hay que respetar:

- **Anotar el enlace no puede tumbar la publicación.** Va en un `try/catch` que se
  ignora, aparte del `try` que publica: el post ya está en la cuenta y eso es lo
  irreversible, así que un fallo al anotar no debe devolver un error que invite a
  reintentar y duplique el post (mismo criterio que `calentarVideo`). Si falla,
  `/hoy` cae a su respaldo y como mucho apunta al post anterior.
- **La cadena de respaldos es tabla → `ENLACE_HOY` → perfil**, y cada candidato pasa
  por `esUrlValida()`. Nunca se queda sin destino: el enlace ya está compartido en
  chats de gente que no va a volver a preguntar.
- **Solo lo anota el cron de tasas.** Los posts de noticias de `/admin` no tocan
  `/hoy`: "el post del día" es el de tasas.
- `/hoy` va con `Cache-Control: no-store` desde `next.config.ts`, junto a la cabecera
  de la portada. Si la CDN se queda una copia, el enlace lleva toda la tarde al post
  de la mañana.
- **El service worker tiene que dejarla pasar.** Sirve *cualquier* navegación desde
  la caché de la portada, así que sin la guarda de `ATAJOS` en `public/sw.js` `/hoy`
  mostraría la portada en vez de abrir el post. Al tocar eso se sube `VERSION`.
- **`/wa` no tiene respaldo en el código**, al contrario que `/ig`: un número de
  WhatsApp no se adivina y uno inventado mandaría a un chat ajeno. Sin
  `ENLACE_WHATSAPP` la ruta simplemente no existe.

### La IA solo redacta prosa, y siempre con revisión humana

Dos textos de `/admin` se pueden pedir a un modelo de OpenRouter (plan gratuito):
el caption de un post de noticia y el párrafo de análisis del reporte semanal.
Todo lo demás sigue saliendo de las plantillas de `lib/caption.ts`.

- **La IA no toca ni una cifra.** Los números los calculan `convert()`,
  `lib/pesos.ts` y `lib/semanal.ts`, y el modelo solo escribe alrededor. Es la
  misma regla que ya gobierna el proyecto —lo que se muestra es lo que se
  calcula— llevada a su consecuencia obvia: un modelo que redondea de memoria
  publicaría un número que no cuadra con la calculadora, que es justo el daño
  que esta app no puede causar. Por eso a `redactarAnalisisSemanal` se le pide
  expresamente que **no repita** las cifras: ya están en la imagen y en las
  líneas del caption.
- **No hay IA en ningún cron.** Ni en el post diario de tasas ni en la cola de
  programadas. Un modelo gratuito caído a las 9:00 no puede ser el motivo de que
  el post del día no salga, y un texto que nadie mira no puede acabar publicado
  en la cuenta real. La IA solo vive detrás de dos botones de `/admin`.
- **`lib/ia.ts` nunca lanza: devuelve `null`.** Sin clave, 401, 429 por cuota
  agotada, timeout o respuesta vacía son el mismo caso para quien llama, y la
  respuesta a todos es la plantilla de siempre. Mismo criterio que
  `construirReporteSemanal()`, `destinoDeHoy()` y `calentarVideo()`. Por lo
  mismo, `/api/admin/redactar` contesta **200 con `texto: null`** cuando ningún
  modelo respondió: no haber redactado no es un fallo de la petición, y la
  interfaz solo tiene que decir que se queda el texto de plantilla.
- **La lista de modelos está en `OPENROUTER_MODELOS`, no en el código.** Los
  `:free` de OpenRouter aparecen, se renombran y se retiran sin aviso; cambiar de
  modelo no puede exigir un despliegue. Se recorren en orden y se pasa al
  siguiente ante cualquier fallo, con un timeout propio de 20 s: un modelo
  colgado no puede comerse el minuto de la función.
- **Se dispara al pulsar un botón, nunca al abrir una pantalla.** Es lo que
  mantiene el gasto dentro del plan gratuito —ninguna visita de la portada
  consume cuota— y también lo que garantiza que alguien está mirando cuando el
  texto aparece. El reintento es volver a pulsar, así que `lib/ia.ts` tampoco
  lleva reintentos ni caché propios.
- **`sanearTextoIa()` quita las URLs y el markdown.** Las primeras porque el pie
  de tres enlaces lo pone `conPieEnlaces()` en un solo sitio, y un enlace
  inventado por el modelo rompería esa regla mandando al lector a cualquier
  parte; el segundo porque Instagram no lo interpreta y saldrían los asteriscos
  a la vista. El crédito de la noticia (`Fuente: <host>`) tampoco se deja al
  criterio del modelo: se añade después si no está, con el hostname de la URL
  que se pidió publicar, igual que hace `buildNewsCaption()`.
- **Del navegador solo viaja la prosa.** `/api/admin/publish-semanal` sigue
  componiendo el caption en el servidor con las tasas del momento —esa es su
  razón de ser— y del cliente acepta únicamente `analisis`, que vuelve a sanear
  aquí: que el cliente ya lo hiciera no es algo en lo que se pueda confiar. El
  párrafo entra en un hueco fijo, después de las cifras, con
  `conAnalisisSemanal()`; esa función existe suelta —y no como un `if` dentro de
  `buildCaptionSemanal`— porque el panel tiene que enseñar el caption exacto
  mientras se escribe, y con la inserción en dos sitios la vista previa y lo
  publicado podrían colocarlo en lugares distintos.
- **El caption de noticia no marca la vista previa como desactualizada.** A
  diferencia del título y la fuente, no entra en la imagen firmada, así que
  cambiarlo no cambia lo que se publicaría.
- Los prompts viven en `lib/ia-textos.ts`, aparte del cliente, por el mismo
  motivo que `lib/semanal.ts` vive aparte de la ruta de su imagen: son criterio
  editorial y se tocan mucho más que el transporte. Se iteran con
  `npx tsx scripts/preview-ia.ts noticia "<url>"` o `… semanal`, que imprimen
  también el texto de plantilla: lo que hay que comparar no es la IA contra la
  nada, sino contra lo que ya se publicaba.

### El aviso legal se queda

El pie declara que los datos son de terceros, que La Tasa no fija ni certifica
ninguna tasa y que nada de lo mostrado es asesoría financiera. No lo quites ni lo
suavices.

### El post de noticias es manual, con scraping por portal y firma HMAC

Además de los dos posts diarios de tasas, existe un post ocasional armado a
mano a partir de un artículo externo: imagen "estilo noticiero" con la marca
de La Tasa + caption por plantilla, sin IA. Se dispara desde dos sitios que
comparten la misma lógica en `lib/publish-news.ts` — `app/api/publish-instagram-news`
(con `CRON_SECRET`, para curl) y `/admin/noticia` (con contraseña propia, para
el teléfono, ver más abajo) — nunca por cron.

- `lib/providers/news.ts` (`fetchArticle`): título, imagen y fecha se leen con
  un extractor **genérico** de meta tags (`og:title`, `og:image`,
  `article:published_time`), porque son estándar en cualquier portal WordPress
  observado hasta ahora. El **cuerpo** del artículo no es genérico — cada
  portal estructura su contenedor distinto (`entry-content` en lapatilla,
  `content-inner` en bitlyanews, `textnota` en lanacionweb, que ni siquiera es
  la primera clase de la lista por usar el theme Bricks Builder) — así que vive
  en `CONTENEDOR_POR_HOST`, una entrada por portal que se agrega a mano cuando
  se suma uno nuevo. Si el portal no está en el mapa, se degrada a la
  descripción corta del `<meta>` en vez de romper. Ahí se prueba
  `og:description` **antes** que `description`: la genérica es donde se cuelan
  los restos del theme, y en identidadcorrentina.com.ar hay dos —la primera es
  literalmente "Newspaper & Magazine HTML Template"— y `metaContent` devuelve
  la primera que encuentra.
- Que los meta tags sean estándar no significa que vengan limpios. Tres cosas
  que hay que deshacer antes de publicar nada, todas verificadas en vivo:
  - **El nombre del portal se cuela en el `og:title`**, y no siempre detrás:
    identidadcorrentina.com.ar lo pone delante (`Identidad Correntina »
    Colombia y Venezuela…`) y bitlyanews encadena dos (`… - AlbertoNews -
    Periodismo sin censura`). `quitarNombreDelSitio()` recorta por prefijo y
    por sufijo, en bucle, pero **solo si el fragmento coincide** con el
    `og:site_name` (o alguno de sus trozos) o con el hostname, comparando sin
    acentos ni puntuación. Esa condición es lo que hace seguro el recorte: sin
    ella, cortar por el primer separador se comería titulares legítimos como
    "Alerta: sube el dólar" o "VIDEO: tiroteo en Tailandia".
  - **Las entidades HTML se decodifican completas**, no con un mapa corto.
    Hubo uno de seis entradas y se publicó un titular con `&raquo;` a la vista
    y otro con `&ntilde;` partiendo una palabra. Ahora entra todo el bloque
    Latin-1 —generado desde una lista de nombres en orden de código, porque el
    estándar los define consecutivos— más las numéricas. Se decodifica en
    **una sola pasada**: encadenar dos convertiría `&amp;lt;` en `<`, que no
    es lo que el portal escribió.
  - **Hay portales que sirven UTF-8 declarándolo Latin-1** y llega
    `corresponsalÃ­a`. `repararMojibake()` lo deshace, con dos guardas para no
    estropear texto sano: se abstiene si el texto tiene algún carácter fuera
    de Latin-1 (señal de que ya está bien decodificado) y descarta el
    resultado si aparece `�`.

  Y el orden importa: se decodifica **antes** de recortar el nombre del sitio.
  Mientras el separador siga siendo `&raquo;` en vez de `»`, no hay dónde
  cortar.
- El crédito de fuente (`sourceHost`) sale siempre del hostname de la URL que
  se pidió publicar, **nunca** de `og:site_name`: se encontró un caso real
  (bitlyanews.com) donde el propio HTML se identifica como otro dominio —
  confiar en ese campo le atribuiría la noticia al sitio equivocado.
- La imagen del artículo se descarga y se normaliza a PNG con `sharp`
  (dependencia de producción, no solo del script de iconos) antes de
  embeberla: Satori no garantiza soportar todos los formatos que traen los
  portales (AVIF, por ejemplo).
- `app/api/og/instagram-post-news` recibe título/imagen/fuente por query
  string para poder generar la imagen on-demand, como exige la Graph API de
  Instagram, y por eso queda sin autenticación (Instagram debe poder
  descargarla). Pero eso vuelve ese texto controlable por quien arme la URL,
  así que los parámetros van firmados con HMAC (`lib/news-signature.ts`,
  mismo `CRON_SECRET`) — sin eso, cualquiera que encontrara la ruta podría
  generar una imagen con la marca de La Tasa y contenido arbitrario.
- El caption se puede editar a mano en `/admin/noticia` antes de publicar
  (`publishNewsPost` acepta un `captionOverride`): el scraper no siempre trae
  exactamente los párrafos que se quieren usar.
- El título es **opcional** en la firma y en la plantilla: las diapositivas
  secundarias de un carrusel no lo llevan (ver más abajo). La firma cubre
  exactamente los parámetros presentes, así que añadir o quitar `title` de una
  URL ya firmada la invalida — no hay forma de colar un titular ajeno.

### El post de noticias también admite contenido propio, carrusel y Reel

Sobre lo anterior se puede montar más material: varias imágenes propias, un
video, o una noticia escrita de cero sin artículo externo. Todo desde
`/admin/noticia`, con un switch **Post / Reel** que se decide antes de cargar
nada, porque determina el encuadre.

- **La imagen propia no sustituye a la plantilla, la alimenta.** Lo que sube
  el usuario va a Cloudinary y de ahí entra al mismo marco firmado que la foto
  scrapeada. Nunca se publica una imagen cruda con la cuenta de La Tasa.
- **El título y la fuente no se graban en la foto**: el marco los compone en
  cada render, leyendo los valores actuales. Por eso editarlos después de
  subir la imagen no la estropea — solo deja obsoleto lo que se ve en
  pantalla. La interfaz lo marca como desactualizado y bloquea publicar hasta
  regenerar, en vez de bloquear los campos: obligar a borrar y resubir la foto
  por corregir una tilde cuesta una subida entera desde el teléfono.
- Las **diapositivas secundarias** van sin titular, y la foto se queda ese
  espacio (`ALTO_FOTO` en la plantilla). Repetir el titular en cada una no
  aporta y le quita sitio a la imagen.
- El marco de noticias **no lleva fecha**. La llevaba arriba a la derecha, pero
  una noticia no caduca a la misma hora que una tasa: fecharla la deja vieja en
  el perfil al día siguiente, y la fecha del artículo ya va en el caption. Los
  posts diarios de tasas sí la conservan —ahí el dato *es* del día y la hora—,
  y viven en rutas aparte (`instagram-post`, `instagram-post-pesos`).

Instagram impone dos reglas que explican el resto del diseño:

- **Todos los elementos de un carrusel comparten relación de aspecto**, la del
  primero, o Meta rechaza el contenedor padre. Por eso la imagen principal va
  siempre primera y el video se reencuadra según su destino.
- **Un video dentro de un carrusel no es un Reel**: va como `media_type=VIDEO`,
  no `REELS` —Meta los excluye explícitamente— y no aparece en la pestaña de
  Reels. De ahí el switch: `carrusel` reencuadra a 1:1 para casar con la imagen
  cuadrada, `reel` a 9:16 que es lo único que entra en esa pestaña.

**Antes de publicar cualquier contenedor hay que sondear su `status_code`.** Es
el paso intermedio del flujo de Meta —crear, sondear hasta `FINISHED`,
publicar— y saltárselo devuelve el error 9007, "Media ID is not available". Se
sondean los hijos de video **y también el padre del carrusel**: el padre
también se procesa, y con un video dentro tarda mucho más que los pocos
segundos del reintento corto de `publicarContenedor`. Mientras solo se
sondearon los hijos, el carrusel de puras imágenes pasaba de milagro —su padre
está listo casi al instante— y el que llevaba video fallaba siempre al darle
"Publicar". Si Meta no devuelve el campo `status_code`, se sigue adelante en vez
de esperar en balde: queda el reintento ante el 9007, que es como funcionaba
antes de existir el sondeo.

Por lo mismo, los routes que publican (`/api/admin/publish-carrusel`,
`/api/admin/publish-video`, `/api/publish-instagram-news`) declaran
`maxDuration = 60` igual que los de cron: esperar a que Meta procese un video
no cabe en el tope por defecto de una función.

`publishCarousel` (`lib/instagram.ts`) es la **única** primitiva de carrusel y
la comparten el post diario y el de noticias; `publishCarouselPost` quedó como
atajo para el diario, que siempre son imágenes. Mantiene la creación de hijos
en paralelo por el motivo ya explicado arriba, y la espera de los videos va
**después** de crearlos todos, no intercalada, para que Meta los procese a la
vez en vez de encadenar un polling tras otro.

### La barra de subida mide un tramo y declara el otro

Subir un video desde el teléfono tarda, y antes solo se veía un texto fijo
("Subiendo y aplicando la marca…") sin manera de saber si avanzaba. Ahora hay
barra con porcentaje, pero **solo en el tramo que de verdad se puede medir**.

- El porcentaje sale de `XMLHttpRequest.upload.onprogress` (`lib/subida.ts`), y
  es la única razón por la que ahí se usa la API vieja en vez de `fetch()`:
  `fetch()` no emite progreso de subida. El resto del proyecto sigue con
  `fetch()`, que no tiene nada que medir.
- Ese porcentaje cubre el viaje **del teléfono a Cloudinary**. Lo que sigue
  —Cloudinary procesando el archivo antes de responder— es una espera de la que
  el navegador no recibe ningún avance. Al terminar el envío (`upload.onload`)
  la barra pasa a indeterminada y el texto dice qué está pasando. No lo cambies
  a estimar un porcentaje hasta 100: sería un número inventado, y en un video
  pesado se quedaría clavado en 95 % un buen rato.
- `Subida.origen` en `PublicarNoticiaForm` existe para pintar la barra **debajo
  del control que se tocó**: esa pantalla tiene tres sitios desde donde subir, y
  una barra suelta no dice cuál de ellos está trabajando.
- Los errores de subida muestran el mensaje que devuelve quien falló (el tope de
  tamaño, o el `error.message` de Cloudinary) en vez de un "no se pudo subir"
  genérico: el motivo es lo que le dice al admin si reintentar o cambiar el
  archivo.

### El archivo va directo del navegador a Cloudinary

En Vercel el cuerpo de una petición a una función tiene un tope de unos 4,5 MB.
Mientras el archivo pasaba por `/api/admin/subir-media`, cualquier video de
teléfono lo superaba —18 MB para 1:17 a 720p, verificado— y la plataforma
respondía **413 antes de ejecutar una línea de código nuestro**: ni siquiera
llegaba a correr la validación de 100 MB de `subirMedia`, así que el admin veía
la barra llegar al final y luego un error sin explicación.

Por eso esa ruta ya no existe y el archivo sube **directo a Cloudinary**, que
acepta hasta el tope real. Nuestro servidor sigue siendo quien autoriza:

- `/api/admin/firmar-subida` comprueba la cookie de sesión y devuelve una firma
  de un solo uso (`firmarSubidaDirecta`). `CLOUDINARY_API_SECRET` nunca llega al
  navegador; la `api_key` sí, que es pública por diseño.
- Se firma **solo el `timestamp`**. La firma de Cloudinary cubre exactamente los
  parámetros incluidos, así que dejar fuera todo lo demás es lo que impide que
  el navegador añada ninguno: cualquier parámetro extra la invalida. No le
  agregues campos "por comodidad" sin entender que amplías lo que un cliente
  puede pedir. El `resource_type` no se firma porque viaja en la ruta.
- El tope de tamaño lo sigue decidiendo el servidor —viaja en el permiso— pero
  lo aplica el navegador: al no ver ya el archivo, el servidor no puede medirlo.
  No lo dupliques como constante en el cliente.

### El video se marca en Cloudinary, no en el servidor

Superponer una franja de marca sobre **todo** el clip es una operación de
video, y ni Satori ni `sharp` la hacen. Las dos alternativas obvias no caben:
un binario de ffmpeg pesa 70–100 MB y empuja el bundle hacia el tope de la
función, y Remotion depende de Chromium — su propia documentación dice que no
se puede renderizar en Vercel Serverless. Se eligió **Cloudinary** porque el
overlay fijo es exactamente una transformación por URL, sin componer nada a
mano, y su plan gratis no exige tarjeta ni una cuenta de AWS como pedían las
otras opciones evaluadas (Remotion Lambda, Shotstack).

Vive en `lib/providers/cloudinary.ts`, con tres detalles que costó encontrar:

- La posición (`gravity`, `x`, `y`) va en el componente **`fl_layer_apply`**,
  no junto al `overlay`. Puesta junto al overlay, Cloudinary la ignora **en
  silencio** y centra todas las capas encima del video: no falla, solo sale
  mal (verificado en vivo).
- El **encuadre va primero**, antes de las capas. Al revés, los tamaños del
  logo y del texto se calculan contra el lienzo original y quedan
  descuadrados al escalar.
- Se encaja con `pad` y no con `fill`: recortar perdería los bordes del
  encuadre que grabó el usuario.

La marca de identidad es el **sello** superpuesto, que va en todo video. La
banda de abajo es otra cosa: es el **cintillo**, y es opcional — ver la sección
siguiente.

- La fuente del video es un campo **aparte del `sourceHost`** que llena el
  marco de las imágenes, y en un carrusel va por elemento: un clip prestado no
  tiene por qué venir del mismo portal que la noticia que acompaña.
- El texto pasa por `limpiarFuente()`, que sustituye `,` `/` `%` `#` `?`. Eso
  viene de cuando el crédito viajaba dentro del **path** de Cloudinary, donde
  esos caracteres son separadores y partían la transformación. Hoy se dibuja en
  el PNG del cintillo y ya no toca ninguna URL, pero se conserva como saneado y
  tope de longitud.
- Devuelve `undefined` cuando no queda nada, de modo que "casilla activada pero
  campo en blanco" se comporte igual que "desactivada". Sin eso saldría una
  banda que solo dice `Fuente:`.
- En la interfaz, editar la fuente **no** regenera el video en pantalla: la
  marca la compone Cloudinary al pedir la URL. Se marca la previa como
  desactualizada y se bloquea publicar hasta pulsar "Actualizar vista previa",
  el mismo trato que ya recibían el título y la fuente del marco — y por el
  mismo motivo, que publicar a ciegas es justo lo que hay que evitar.

Las credenciales (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`) nunca llegan al navegador: la subida pasa por
`app/api/admin/subir-media`, protegido por la cookie de sesión de `/admin`.

### El cintillo se compone con Satori, no con el motor de texto de Cloudinary

La banda inferior de los videos —marca, titular y, si se acredita, la fuente—
se genera como un **PNG transparente con `ImageResponse`** (`lib/og-cintillo.tsx`)
y Cloudinary solo la superpone como **una capa ya compuesta**. Es el mismo
mecanismo que ya usaba el sello, así que no es técnica nueva: lo que cambió es
que el PNG se genera por post en vez de ser fijo.

Antes el crédito lo pintaba el motor de texto de Cloudinary. Se retiró a
propósito y no conviene reintroducirlo, por tres motivos que se pagaron:

- La única tipografía a mano era **Arial**, que no es la del proyecto. El
  cintillo usa Geist, la misma de las imágenes.
- El texto viajaba **dentro del path** de la URL, donde `,` separa parámetros y
  `/` separa componentes. Un titular real lleva comas: `limpiarFuente()` existe
  solo por eso. Ahora el texto no toca ninguna URL.
- Un cintillo son varios elementos, y ahí cada uno es un `overlay` más un
  `fl_layer_apply` colocado a mano en píxeles, **sin ajuste de línea**. Aquí es
  flexbox.

Lo que hay que respetar:

- **El contenedor raíz no lleva `backgroundColor`.** De ahí sale la
  transparencia (verificado: `hasAlpha`, `isOpaque: false`). Si alguien le pone
  un fondo, el cintillo tapa el video entero.
- **Dos variantes**: con título (banda alta) y sin título (banda baja, solo el
  crédito). La segunda es la que cubre el caso "acredito la fuente pero no
  quiero cintillo", y es la razón de que no quede ni un texto en Arial. Sin
  título y sin fuente no se superpone ninguna banda.
- **La marca va en un círculo que asoma por encima de la franja**, con el
  `@latasa.online` debajo. El handle está ahí para que la cuenta viaje con el
  video si alguien lo descarga y lo difunde: el sello dice "La Tasa", que es el
  nombre del medio y no el perfil. Tiene el límite conocido de que un video sin
  cintillo se queda sin él — se decidió así a sabiendas; si algún día pesa más
  la atribución, el sitio es el sello.
- **La taza se centra por su masa, no por su caja.** El dibujo es asimétrico —el
  asa sale a la derecha, el platillo carga abajo—, así que centrado por su caja
  se ve bajo y escorado: medido sobre el PNG, su centro de masa caía 1,9 px a la
  izquierda y 3,7 px por debajo. `AJUSTE_LOGO` lo compensa. El efecto es que la
  caja queda algo alta, y es inevitable: en una forma asimétrica centrar la masa
  y centrar la caja son cosas distintas, y manda la masa.
- **La franja crece con el texto y no tiene tope de líneas.** El titular puede
  ocupar dos, tres, cuatro o más, y la banda se hace más alta para acomodarlo.
  Solo tiene suelo (`ALTO_MINIMO_FRANJA`, 150 px), y no lo marca el texto sino
  el círculo del logo más el handle, que tienen que caber dentro; con dos
  líneas y crédito la franja sale en ~176 px, a un pelo de los 180 que medía
  cuando el alto era fijo. Llegó a medir 260 y eran más de 100 px tapando video para
  nada, así que crecer sí, pero desde el contenido.
- **El alto del PNG se estima, y se estima por lo bajo a propósito.** Satori
  exige el alto del lienzo *antes* de maquetar, así que no hay forma de
  preguntarle cuántas líneas salieron: `altoFranja()` las calcula a mano
  dividiendo el titular entre `CARACTERES_POR_LINEA`, un número deliberadamente
  corto, más una línea de holgura. Los dos errores no cuestan igual —
  quedarse corto recortaría el titular, mientras que pasarse solo deja lienzo
  transparente de más, y ese no se ve: Cloudinary ancla la capa por su borde
  inferior (`gravity: south`), de modo que unos píxeles vacíos arriba no mueven
  la franja. No lo "afines" a una medida exacta: la holgura es la red.
- **El texto va centrado en el hueco que queda a la derecha del logo**, tanto el
  titular como el crédito que lo acompaña. Hacen falta `justifyContent` **y**
  `textAlign` en cada `span`: el primero coloca la línea suelta (una sola línea
  es un único hijo del flex) y el segundo alinea las demás cuando el texto
  envuelve, y heredadas del contenedor no llegan a todos — verificado, el
  crédito se quedaba a la izquierda. La caja se deja a ancho completo y se
  centra el texto dentro; encogerla al contenido la mediría a línea completa y
  un titular largo se saldría en vez de envolver. La variante de solo crédito
  no se centra: ahí esa línea es toda la franja y sigue a la izquierda.
- **El cintillo se decide por video, no por post**: cada clip de un carrusel y
  el Reel llevan su propia `MarcaVideo` (`titulo`, `fuente`, `segundos`). Los
  tres campos son opcionales porque en la cola hay posts programados antes de
  que el cintillo existiera.
- **Un video principal solo puede titularse así.** El `title` del marco lo
  compone la plantilla de imagen, y con un video principal no hay imagen que
  enmarcar; el cintillo es la única vía.
- `asegurarCintillo()` sube el PNG con un **`public_id` derivado del contenido**,
  así que el mismo titular reutiliza el mismo asset y no se acumula uno por cada
  "Actualizar vista previa" en una cuenta de 25 créditos al mes.
  **`VERSION_CINTILLO` entra en el hash**: si cambias el diseño y no la subes,
  los videos siguen sirviendo el PNG viejo ya cacheado.
- **Sube siempre, con `overwrite: false`, y esto no es un descuido.** Al principio
  seguía el patrón de `asegurarLogo()` —preguntar por el recurso y subirlo solo
  si la consulta fallaba— y con eso **el cintillo no llegaba nunca al video**: si
  esa consulta no lanza para un `public_id` inexistente, no se sube nada y la URL
  apunta a un asset fantasma. Lo que lo hizo difícil de encontrar es que ahí no
  hay error: **Cloudinary ignora en silencio una capa que no encuentra** y sirve
  el video sin ella (verificado en producción: salía el sello, no el cintillo, y
  la petición respondía 200). Subir siempre elimina la suposición, y con
  `overwrite: false` una subida repetida no reemplaza nada. No lo "optimices"
  devolviendo a comprobar-y-subir.
- Por lo mismo, la vista previa devuelve **`conCintillo`** y la interfaz lo
  muestra. Una capa que no se aplica es invisible por definición, así que sin ese
  dato el admin publicaría creyendo que lleva marca. Es la misma idea que el
  aviso de "vista previa desactualizada": que no se publique a ciegas.
- `previewNewsVideoPost` compone las dos URLs **en serie, no con `Promise.all`**:
  las dos resuelven el mismo cintillo, y en paralelo lo generaban y lo subían dos
  veces a la vez.
- `MAX_TITULO` ya **no** es el límite de dos líneas que fue: es un tope de
  seguridad alto (200 caracteres, ~8 líneas). Pasado ahí la banda taparía medio
  video y un titular así ya no se lee de pasada, que es para lo que existe el
  cintillo. Sigue recortando por caracteres porque Satori no implementa
  `line-clamp`.
- El margen inferior se calcula **proporcional a la altura del lienzo**
  (`yDelCintillo`), por el mismo motivo que `yDelSello`: los tres formatos
  comparten anchura pero no altura. Un mismo PNG sirve para los tres.
- `segundos` acota la capa con `start_offset`/`end_offset` para que el cintillo
  entre y salga. Sin ellos, Cloudinary la aplica a todo el clip.

### La vista previa se puede descargar, y cada mitad por su lado

Desde `/admin/noticia` se puede bajar al equipo lo que se está viendo. **El
atributo `download` de HTML no basta**: se ignora en recursos de otro origen, y
los videos los sirve Cloudinary.

- **Video**: `urlDescargaVideo()` añade `fl_attachment` a la transformación, y
  Cloudinary responde con `Content-Disposition: attachment`. Reutiliza
  `transformacionMarca()` a propósito — lo que se descarga tiene que ser lo que
  se publicaría, no el original sin marcar.
- **Imagen**: `?descargar=1` en `instagram-post-news`, que responde con la misma
  cabecera. Va por cabecera y no con `download` porque en iOS ese atributo es
  poco fiable, y el admin trabaja desde el teléfono.

`descargar` **no invalida la firma HMAC**, aunque lo parezca: la ruta
reconstruye el conjunto firmado leyendo claves conocidas por nombre, así que un
parámetro de más no entra en `firmados`. Verificado en vivo: con `descargar=1`
la imagen sigue dando 200, y manipular el título sigue dando 403. Solo cambia
una cabecera — la imagen generada es idéntica.

La URL de descarga la resuelve **el servidor** y baja con la vista previa
(`DiapositivaPrevia.descargaUrl`), en vez de componerla el navegador: las dos
mitades no se piden igual, y el cliente no tiene por qué saber cuál es cuál.

### `/admin` usa su propia contraseña, no `CRON_SECRET`

`ADMIN_PASSWORD` es un secreto aparte a propósito: son dos superficies de
ataque distintas — una vive en un formulario que se teclea desde el teléfono,
la otra protege los endpoints de publicación/cron. La sesión es una cookie
`httpOnly` firmada con el mismo patrón HMAC que `lib/news-signature.ts`
(`lib/admin-session.ts`), sin ninguna librería de sesiones nueva.
`CRON_SECRET` nunca llega al navegador: `/admin/noticia` lo usa solo del lado
servidor, a través de `publishNewsPost`.

Cuelgan tres páginas de esa misma sesión —`/admin/noticia`, `/admin/semanal`
y `/admin/canal`—, más `/admin` como menú de entrada. Siguen siendo páginas
separadas y no pestañas de una: la primera es un formulario con estado propio
—switch Post/Reel, subidas, previa desactualizada, cola— y el reporte semanal
**no tiene entradas**: se mira y se publica. La nav compartida vive en
`components/AdminNav.tsx`; antes cada página repetía a mano su enlace cruzado
y con tres hermanas más el menú ya pesaba más duplicarla que extraerla.

### El envío al canal de WhatsApp es manual, y por eso `/admin/canal`

El pedido original era reenviar automáticamente cada post de Instagram al
canal de WhatsApp de La Tasa. No se automatizó, por dos motivos verificados
en 2026 y no una limitación de tiempo:

- **Los Canales de WhatsApp no tienen API oficial de Meta.** La única forma
  de publicar en uno por código es una librería no oficial (tipo Baileys)
  que enlaza el número real por QR y viola los términos de servicio de
  WhatsApp — el mismo tipo de riesgo que el proyecto ya evita en otras
  decisiones (raspar el BCV con cuidado en vez de usar APIs de terceros
  dudosas, no usar ffmpeg de terceros para el video). Arriesgar el número de
  WhatsApp del negocio por automatizar un reenvío no vale la pena.
- **La WhatsApp Business Cloud API oficial ya no es gratis para difusión.**
  Desde julio de 2025 Meta cobra por mensaje de plantilla; solo es gratis
  responder dentro de una ventana de 24h a alguien que ya escribió, lo que no
  sirve para un modelo de difusión a un canal.

`/admin/canal` (`app/admin/canal/page.tsx`) resuelve un flujo
**semiautomático** en su lugar: lista los posts publicados en Instagram en
los últimos 7 días y, al elegir uno, arma el mensaje listo para copiar y
pegar a mano en el canal. El envío lo sigue haciendo el admin.

- **La lista sale de la Graph API, no de una tabla propia**
  (`listarMediaSemana` en `lib/instagram.ts`). Cada media de nivel superior
  —carrusel, imagen o Reel— es exactamente un post, y Meta ya lleva ese
  registro con `since`/`until` como filtro de fecha; duplicarlo en Supabase
  sería mantener dos veces la misma verdad. Por lo mismo no hay tabla que
  junte tasas diarias, noticias y reporte semanal en un solo lugar: la cuenta
  de Instagram ya es esa lista.
- **`formatMensajeCanal` (`lib/canal-whatsapp.ts`) solo dice formato, no
  contenido.** Todo caption ya publicado termina con el mismo pie de tres
  enlaces (`pieEnlaces()` en `lib/caption.ts` — ver la sección sobre
  `/p/<slug>`), pero apuntando a un atajo (`/hoy` o `/p/<slug>`) porque al
  armar el caption el permalink real todavía no existe. Aquí sí lo tenemos
  —sale de la Graph API, del post que se está mirando—, así que
  `formatMensajeCanal` es solo `conPieEnlaces(caption, permalinkPost)`:
  reconstruye el mismo pie pero con el enlace directo en vez del atajo. No hay
  IA de por medio, igual que los captions de origen.
- **El texto se muestra editable, no de solo lectura**
  (`components/BotonCopiarTexto.tsx`). Es el mismo criterio que
  `captionOverride` en noticias: lo que arma la plantilla es un punto de
  partida, no algo intocable.

## Cómo trabajar en este proyecto

### Estilos

Antes de escribir interfaz, lee `ESTILOS.md`: tokens de color, escala tipográfica
por rol, radios, recetas de componente y las reglas duras (ningún color crudo de
Tailwind, nada de `md:`, `.tabular` en todo número). Su última sección lista las
desviaciones que ya existen, para no copiarlas por error.

### Commits

Van a nombre de **Yuncozer \<daniel.krdns@gmail.com\>**, sin pie de coautoría y sin
enlace de sesión: el usuario lo pidió expresamente. Los mensajes se escriben en
español y explican **por qué** se hizo el cambio, no solo qué se tocó.

### Publicación

Se empuja a `main`, y Vercel despliega solo desde esa rama. No hace falta
desplegar a mano.

### Antes de publicar

`npx tsc --noEmit`, `npm run lint` y `npm run build`, los tres limpios. Además:

- **Cambios de interfaz**: comprobarlos en Chromium a 390 px y a 1280 px, sin
  errores de consola ni desbordes horizontales.
- **Cambios del service worker**: probarlos **con un perfil de navegador limpio**.
  Una prueba sobre un perfil ya usado da falsos positivos —el navegador sirve la
  página de su propia caché HTTP y parece que funciona—; así se escapó el fallo de
  la pantalla en blanco sin conexión.
- **Cambios en los proveedores**: verificar el valor contra la fuente original y
  probar también el camino de degradación, apuntando el proveedor a una URL
  inválida y confirmando que cae al respaldo.

### Probar las marcas en local, sin publicar ni pasar por `/admin`

La app marca **cinco piezas**, y todas se pueden revisar sin publicar nada. Los
tres scripts se reparten el trabajo:

| Script | Para qué | Necesita `npm run dev` |
| --- | --- | --- |
| `scripts/preview-noticia.ts <url>` | Un artículo real: imagen enmarcada + caption | Sí |
| `scripts/preview-marca.ts <archivo>` | Material propio: marcos, video en sus tres lienzos, sello y cintillo | Solo para las de imagen |
| `scripts/preview-semanal.ts` | El reporte semanal: caption y las dos URLs (1:1 y 9:16) | Sí |

```bash
# Artículo real: imprime el caption y una URL firmada de la imagen
npx tsx scripts/preview-noticia.ts "https://url-del-articulo"

# Material propio: sube el archivo e imprime las URLs de todas sus variantes
npx tsx scripts/preview-marca.ts foto.jpg     # marco principal y secundario
npx tsx scripts/preview-marca.ts clip.mp4     # video en 1:1, 4:5 y Reel, con su fotograma

# Opciones de preview-marca.ts
--titulo "…"          # titular del marco (imagen) y del cintillo (video)
--fuente "…"          # crédito del marco y del cintillo
--proporcion 1:1|4:5  # lienzo del marco de imagen
--segundo N           # de qué segundo se saca el fotograma del video
--public-id <id> --tipo imagen|video   # reusa algo ya subido, sin volver a subirlo

# Reporte semanal: imprime el caption y las dos URLs (no lleva firma)
npx tsx scripts/preview-semanal.ts
npx tsx scripts/preview-semanal.ts --sin-historico   # la degradación del arranque
```

**Qué compone cada pieza y dónde se edita:**

| Pieza | Quién la compone | Dónde se edita |
| --- | --- | --- |
| Marco principal de post | Satori, con titular | `app/api/og/instagram-post-news/route.tsx`, `lib/og-shared.tsx` |
| Marco secundario de carrusel | Satori, sin titular (`ALTO_FOTO`) | los mismos |
| Video (1:1, 4:5 y Reel 9:16) | Cloudinary, transformación por URL | `lib/providers/cloudinary.ts` |
| Sello de marca sobre el video | Cloudinary, capa fija ya subida | el mismo (`SELLO_PUBLIC_ID`, `yDelSello`) |
| Cintillo del video | Satori, PNG transparente que Cloudinary superpone | `lib/og-cintillo.tsx` |
| Reporte semanal (1:1 y 9:16) | Satori, sin firma; las filas salen de `lib/semanal.ts` | `app/api/og/instagram-semanal/route.tsx` |

**Cómo pedir cada variante del video**, que es lo que más se confunde:

- `--titulo "X" --fuente "Y"` → cintillo completo (titular + crédito).
- `--titulo "X"` a secas → cintillo solo con titular.
- `--titulo "" --fuente "Y"` → banda baja, solo el crédito.
- `--titulo "" --fuente ""` → **sin cintillo**: el video sale solo con el sello,
  que es como va el material propio sin acreditar.

**Al iterar, las dos mitades se comportan distinto:**

- **Imagen**: la firma cubre los parámetros, no el HTML. Editas la plantilla,
  recargas el navegador y ya — no hace falta volver a correr el script. Solo hay
  que regenerarla si cambia el artículo, o si se añade o quita el título o la
  proporción, porque la firma cubre exactamente el conjunto de claves presentes.
- **Video**: la transformación viaja en la URL, así que hay que volver a correr
  el script (con `--public-id`, que no resube el original) tras cada cambio.
  Como la URL nueva es otra, tampoco hay caché vieja que invalidar.
- **Cintillo**: además de lo anterior, **sube `VERSION_CINTILLO`** al tocar el
  diseño. Entra en el `public_id` del PNG, así que sin subirla Cloudinary
  reutiliza el que ya tiene cacheado y no verás el cambio por más veces que
  corras el script.

Del video se revisa el **fotograma**, no el clip: `urlFotogramaConMarca()` pide
un JPG sobre la misma transformación que `urlVideoConMarca()` —comparten
`transformacionMarca()` justamente para que lo revisado sea lo publicado—, y
mirarlo es inmediato y deja algo que comparar después. Reproducir el `<video>`
para ver si el overlay quedó bien es mucho más lento.

**Requisitos y avisos:**

- Los tres scripts leen `.env.local` y **se corren desde la raíz del repo**
  (`asegurarLogo()` lee `public/icon-512.png` relativo al directorio de trabajo).
- `preview-noticia.ts` necesita `CRON_SECRET`. `preview-marca.ts` necesita además
  las tres `CLOUDINARY_*`. `preview-semanal.ts` necesita `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY` para leer el histórico, salvo con
  `--sin-historico`, que no consulta nada.
- `npm run dev` hace falta **solo para las URLs de imagen**; las de video las
  sirve Cloudinary directamente.
- Cada corrida sin `--public-id` gasta almacenamiento del plan gratuito (25
  créditos al mes; 1 crédito = 1 GB de almacenamiento o de ancho de banda de
  video). Los archivos de prueba se borran a mano desde el panel de Cloudinary,
  y ahí también se acumulan los `cintillo_` de diseños viejos.
- Si una URL de imagen contesta **403**, el conjunto firmado y el enviado no
  coinciden: es lo que pasaba cuando los scripts firmaban sin `proporcion`
  después de que la ruta empezara a incluirla siempre.
- **Ninguno de los tres publica nada.** Solo publican de verdad
  `POST /api/publish-instagram-news` y los botones de `/admin/noticia` y
  `/admin/semanal`.
- Para probar `/admin/noticia` o `/admin/semanal` en sí —y no solo el render—
  hace falta además `ADMIN_PASSWORD` en `.env.local`.

### El entorno de desarrollo

Este contenedor obliga a salir por `HTTPS_PROXY`, cosa que en producción no ocurre.
Afecta a dos sitios: el raspado del BCV necesita el túnel `CONNECT`, y Chromium hay
que lanzarlo con el proxy para alcanzar direcciones externas.

Además, en algunas máquinas de desarrollo un antivirus con inspección TLS
(AVG, visible como `SSLKEYLOGFILE=...avgMonFltProxy...` en el entorno)
intercepta las peticiones HTTPS salientes con su propio certificado, que el
proceso de `next dev` no confía por defecto. Falla la descarga de la imagen
del artículo en `app/api/og/instagram-post-news`
(`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) y la subida a Cloudinary (`unable to
verify the first certificate`). Es un problema puramente local: no ocurre en
producción, ni con `curl`, ni siquiera con `node` a secas — solo dentro de
`next dev`.

`.claude/launch.json` ya arranca el servidor con el flag, así que por ahí no
hay que hacer nada. A mano hace falta ponerlo:

```bash
NODE_OPTIONS="--use-system-ca" npm run dev
```

El service worker solo se registra en producción, así que para probarlo hace falta
`npm run build && npm start`, no `npm run dev`.

Chromium ya está instalado en `/opt/pw-browsers`; no ejecutes `playwright install`.

### Iconos

Los de la PWA se generan del propio logo con `npm run iconos`. Los PNG se
versionan, así que solo hay que regenerarlos si cambia el logo.

### Tooltips

Para los tooltips de ayuda se maneja un componente standar ubicado /components/Tooltip.tsx, el cual maneja la libreria react-tooltip