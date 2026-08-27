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

`COP_FRONTERA` se llama internamente así, pero el nombre que ve el lector es
**"Peso Binance"** (`label` en `lib/rates.ts`) y no "Peso frontera": el dato
sale de Binance P2P, no de un número propio recogido en las casas de cambio de
Cúcuta —eso es justo lo que el párrafo de arriba dice que no existe—, así que
llamarlo "frontera" sugería una fuente que no es la real. El mismo criterio
vale para las dos filas de dólar que cruzan por esta tasa en el post de pesos
(`lib/pesos.ts`: "Dólar Binance (compra/venta)", no "Dólar frontera…") y para
su versión corta en el caption (`LABEL_CAPTION_PESOS` en `lib/caption.ts`). No
confundir con **"Dólar en La Parada"**, la serie aparte que sí sale de un
punto físico real (ver más abajo): ahí "frontera" seguía siendo válido antes
del cambio de nombre porque el dato mismo era de calle, no de Binance.

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

### La brecha se enseña en la portada y se calcula en un solo sitio

Bajo las tarjetas, la portada dice cuánto se paga de más fuera del BCV. Es la
misma cifra que la tarjeta del reporte semanal, y lo es literalmente:
`calcularBrecha()` se mudó de `lib/semanal.ts` a `lib/brecha.ts` para que las dos
la compartan. Si cada una hiciera su cuenta, el domingo podría publicarse un
porcentaje distinto del que la gente lleva toda la semana viendo en pantalla —el
mismo motivo por el que `lib/pesos.ts` es común a la imagen y al caption.

- **Se mide contra `USD_BINANCE_SELL`**, no contra el `mid` ni contra la compra,
  por lo mismo que en el semanal: una cifra que dice "brecha" tiene que nombrar
  un lado del mercado, y el que responde a la pregunta del lector —cuánto pago
  de más— es la venta. Mostrar las dos brechas diluiría el mensaje en dos
  números casi iguales, y quien quiera esa comparación ya tiene ambas cifras en
  la tarjeta de Binance.
- **No lleva semáforo.** El color no cambia con el valor: eso exigiría inventar
  un umbral (¿15 %? ¿30 %?), y aquí `--warning` es semántico —"este número no es
  de fiar ahora mismo"—, no "este número es alto". Una brecha grande es un dato
  correcto. El ámbar queda para cuando falta una de las dos tasas y entonces se
  dice `Sin dato`, nunca un `0,0 %` ni un guion suelto (mismo criterio que
  `Sin comparación` en el semanal).
- **No lleva la variación de la semana**, que sí tiene la tarjeta del reporte.
  Esa sale de `historico_tasas`, y meter esa lectura en la portada sería una
  consulta a Supabase por visitante — la misma regla que ya prohíbe registrar el
  histórico dentro de `getRates()`. La portada dice **dónde está** la brecha; el
  reporte semanal, **hacia dónde va**.
- **No hay "tiempo real" nuevo.** Se deriva del snapshot que la página ya
  renderiza en el servidor, así que se refresca con la caché de 5 minutos, el
  `s-maxage=60` de la CDN y el botón "Actualizar tasas". No se le añadió ni un
  `setInterval` ni una petición propia: sería inventar movimiento donde el dato
  no cambia más rápido que las fuentes.
- Va en el panel de tasas y **no dentro de la calculadora**: es la distancia
  entre dos tarjetas que están justo encima, y leerlo pegado a ellas explica de
  dónde sale. En la calculadora competiría con el número que el usuario está
  manipulando al teclear, que es el que manda en esa zona.

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

Por ahí se leen también la moneda origen recordada
(`lib/preferencia-moneda.ts`) y si el navegador deja leer el portapapeles: las
dos son estado del dispositivo y las dos necesitan un valor propio para el
servidor. `localStorage` va envuelto en `try/catch` porque Safari en navegación
privada lanza al tocarlo, y eso se lee desde `getSnapshot`: una excepción ahí
tumbaría el render. La lectura se memoriza porque `getSnapshot` tiene que
devolver siempre el mismo valor mientras nada cambie, o React vuelve a
renderizar sin fin.

### La calculadora acompaña cómo se usa de verdad

- **La moneda origen se deriva, no se guarda tal cual.** Manda lo que se toque
  en esta sesión; si no, la preferencia recordada; si no, el arranque por
  defecto — y si esa tasa está caída, la primera que sí tenga precio. Ese
  último eslabón no es teórico: arrancaba fija en `USD_BCV`, que es la tasa más
  frágil de todas (se raspa de la portada del banco) y cuyo botón se
  deshabilita al fallar, así que el origen quedaba apuntando a una tasa nula,
  `convert()` devolvía `null` en **todos** los destinos y no había forma de
  salir de ahí desde la interfaz. `VES` vale 1 por construcción, así que nunca
  se queda sin salida.
- **Se recuerda la moneda, nunca el monto.** Una cifra vieja reaparecida en
  pantalla se confunde con el resultado de ahora, que es justo el daño que esta
  app no puede causar.
- **La comprobación del portapapeles vive en `lib/portapapeles.ts`**, no en la
  calculadora: `/admin/noticia` tiene su propio botón "Pegar" para la URL del
  artículo y necesita exactamente la misma. La regla que comparten es la misma
  que ya justificaba el de aquí — un botón que nunca funciona es peor que
  ninguno— y en los dos sitios la lectura ocurre **al pulsarlo**, nunca al
  abrir la pantalla: así no salta el diálogo de permiso al entrar, y es lo que
  exige Safari para concederlo.
- **Copiar y pegar existen porque la cifra viaja por WhatsApp.** Sin copiar hay
  que transcribir el número a mano, que es donde se cuela un dígito cambiado;
  sin pegar no hay forma de meter un monto que llega por chat, porque el
  teclado propio no da esa vía. El botón "Pegar" se oculta donde el navegador
  no deja leer el portapapeles: uno que nunca funciona es peor que ninguno.
- **`normalizarMontoPegado()` (`lib/format.ts`) no adivina el país.** Acepta
  "1.234,56", "1,234.56" y "Bs 3.055,27" por igual: si aparecen los dos
  separadores manda el último; si solo hay uno, es de miles **solo** con tres
  cifras detrás y algo distinto de cero delante. Esa última condición es la que
  salva `"0,2993"` —la tasa del peso frontera— de leerse como 2993.
- **El teclado propio se queda**, aunque ahora también responda el físico: un
  `<input>` levantaría el teclado del sistema tapando los resultados, y la
  gracia es ver el monto y sus equivalentes a la vez.
- **Los grid items llevan `min-w-0`.** Una celda de grid no se encoge por
  debajo de su contenido salvo que se le diga, así que un monto largo ensanchaba
  la columna de equivalencias y con ella la página entera —el teclado se
  estiraba detrás sin tener la culpa—. Al tocar esa zona conviene comprobarlo a
  390 px con el tope de 12 dígitos, que es donde se nota.

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
  donde el navegador espera la carga de navegación interna. `/historial` lleva la
  suya (`s-maxage=600`) por el mismo motivo.
- **Cada navegación se cachea bajo su propia ruta**, no bajo una clave fija.
  Durante un tiempo el service worker guardaba *toda* navegación como si fuera
  la portada, así que visitar `/historial` con señal dejaba su HTML bajo `"/"`
  y, sin conexión, la app abría en el historial en vez de en la calculadora.
  Se comprobó comparando las dos versiones sobre perfiles limpios. Lo que sí
  se conserva es descartar la **query**: esa era la razón de ser de la clave
  fija —si no, cada `?actualizar=<marca>` dejaría una entrada nueva—, con el
  costo asumido de que `/historial?vista=bs` y `?vista=cop` comparten copia.
  Ojo al depurarlo: el `stale-while-revalidate` de la portada puede hacer que
  el `fetch` interno del worker aún tenga éxito sin red, y eso enmascara el
  fallo en una prueba rápida.

### El service worker precarga al instalarse

Sin ello la app abría **en blanco** sin conexión: en la primera visita todavía no
gobierna las peticiones, así que la navegación que la trae no pasa por él y no se
guarda nada. Los nombres de los archivos de Next llevan un hash que cambia en cada
compilación, de modo que se leen del propio HTML en lugar de mantener una lista
fija que quedaría obsoleta al primer despliegue.

Solo precarga la portada; las demás rutas entran en la caché al visitarse.
Servir `/historial` viejo sin conexión es correcto por definición: cada fila
lleva su fecha a la vista, así que no hay riesgo de hacer pasar un dato
caducado por fresco, que es la única regla dura de estas cachés.

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

### Cada diapositiva del carrusel diario publica también su propia Historia

Además del carrusel de feed, cada disparo de `publicarTasasDelDia()`
(`lib/publish-hoy.ts`) publica **dos Historias**, una por diapositiva, en el
mismo orden en que se deslizan: bolívares primero, pesos después.

- **Puede publicarse sola, a diferencia de la Story del reporte semanal.** La
  limitación de "no se publica desde la app… no admite sticker de enlace ni
  texto" (ver más abajo, sección del reporte semanal) es específica de esa
  Story, que sí necesita un sticker de enlace. La Historia diaria no lleva
  ningún llamado a la acción —es la misma información que ya va en el
  carrusel, en vertical—, así que `media_type=STORIES` de la Graph API la
  publica sin restricciones. `publishStory()` (`lib/instagram.ts`) es el
  atajo: crear contenedor + publicar, sin `caption` (Meta lo ignora ahí).
- **Cabe en la misma invocación del cron, a diferencia del Reel de video.**
  Publicar el carrusel ya son 4 viajes a Meta; cada Historia de imagen suma 2
  más (crear + publicar), sin el sondeo largo que sí necesita un video —
  resuelve con el reintento corto de `publicarContenedor()`, igual que
  `publishDailyPost`. No hace falta tabla, cola ni cron aparte.
- **Es un extra, nunca puede tumbar el post principal.** Cada llamada a
  `publishStory()` va en su propio `try/catch`, después de que el carrusel ya
  tiene `mediaId` — el mismo criterio que anotar el enlace de `/hoy`: el post
  ya está en la cuenta, y un fallo en la Historia no puede convertir una
  publicación exitosa en un error.
- **La imagen es la misma URL del carrusel, con `?proporcion=9:16`.**
  `app/api/og/instagram-post` y `app/api/og/instagram-post-pesos` generan las
  dos proporciones desde la misma plantilla —mismo patrón que
  `instagram-semanal`—, así que la Historia dice exactamente lo mismo que la
  diapositiva que acompaña. El lienzo vertical reserva 110 px arriba y 130
  abajo (`reservaArriba`/`reservaAbajo`) para no quedar tapado por la
  interfaz de Instagram, y sin firma HMAC por el mismo motivo que ya tenían
  estas rutas: no reciben texto libre, solo un valor de un conjunto cerrado.
- **El título nuevo** ("Tasas de hoy", la fecha corta y la moneda entre
  paréntesis con la bandera del lado que corresponde) es el protagonista de
  la Historia, por delante del propio logo — `TituloHistoria()` en
  `lib/og-shared.tsx`. `formatFechaCorta()` (`lib/format.ts`) le da el
  formato "26 de Agosto": sin año, mes con mayúscula inicial, porque el año
  ya se sobreentiende del día en que se publica. El header (`Encabezado`) se
  encoge con su prop `escala` en la Historia (0.5) para que sirva de
  identidad visual sin robarle la mirada al título, y pierde la fecha del
  rincón —ya la dice el título— y se queda solo con la hora.
- El video de tasas (sección más abajo) sigue siendo el único que se dispara
  a mano desde `/admin/video`; esta Historia no lo sustituye ni depende de
  él.

### El cron de tasas no publica con un hueco en las tasas base

`app/api/cron/publish-instagram` puede dispararse a las 9:00 o las 18:00 con
alguna fuente todavía sin responder — el BCV se raspa de su portada y puede
caerse, Binance puede tardar. Publicar de todos modos dejaría el carrusel y
las dos Historias diciendo "No disponible" en una tasa que, dos minutos
después, ya tenía precio: peor que esperar un poco.

- **Solo se gatean las cuatro tasas base**: dólar BCV, euro BCV, Binance
  compra y Binance venta (`TASAS_BASE` en `lib/tasas-pendientes.ts`). Las
  demás claves (`COP_FRONTERA`, `COP_OFICIAL`, `VES`) son cruces derivados de
  estas y de la TRM del Banco de la República — no algo que una fuente pueda
  dejar "a medias", así que gatear sobre ellas no tendría sentido.
- **Solo aplica con `momento` explícito**, es decir, solo al cron. El botón
  "Publicar ahora" de `/admin/hoy` sigue publicando con lo que haya: ahí hay
  una persona mirando la pantalla y decidiendo, el mismo criterio que ya
  separaba `momento` del botón manual antes de esto.
- **`tasas_pendientes`** (migración `0009`) es la cola: una fila por
  `(fecha, momento)`, no un histórico — mismo criterio que `snapshot_hoy` y
  `parada_pendiente`. Si las tasas están incompletas, el cron no llama a
  `publicarTasasDelDia()`: deja la fila con `registrarPendiente()` y devuelve
  200 con `estado: "pendiente"`, no un error — no publicar a tiempo no es un
  fallo de la petición.
- **Un segundo cron, `app/api/cron/publicar-tasas-pendientes`, reintenta cada
  2 minutos** (cron-job.org, no `vercel.json`, mismo motivo que el resto).
  Cada disparo reclama como mucho una fila de forma atómica
  (`reclamarPendiente()`, mismo patrón de `estado=eq.pendiente` en el `WHERE`
  del `UPDATE` que ya usa `reclamarVencida()` en `lib/programadas.ts`, para
  que dos disparos solapados no se lleven la misma fila), comprueba las tasas
  en vivo, y si ya están completas publica con la misma puerta única
  (`publicarTasasDelDia`) que usa el cron normal. Si siguen incompletas,
  suelta la fila (`liberarPendiente`) sin tocar su estado para que el
  disparo de dentro de 2 minutos la retome — no hay fases que avanzar, cada
  intento cabe entero en una invocación.
- **`registrarPendiente()` abandona cualquier otra fila que siguiera
  `pendiente`** al crear la nueva: un `manana` que nunca se resolvió no debe
  seguir reintentándose una vez ya se está esperando el `tarde`, ni una fila
  de un día anterior que por lo que sea quedó viva.
- Un error real al publicar (Meta, Supabase) suelta la fila en vez de darla
  por perdida: sigue en `pendiente` y el próximo disparo de los 2 minutos la
  recoge solo, mismo criterio de "el reintento es automático" que ya rige el
  resto de los crons del proyecto.

### Una tasa presente pero imposible tampoco publica

`tasasBaseCompletas()` cubre que **falte** una tasa. `lib/cordura-tasas.ts`
cubre el caso contrario: un dólar Binance que salta un 40 % entre una lectura
y la siguiente casi nunca es mercado —es un anuncio raro, un cambio de formato
en la fuente o un scrapeo que leyó otra cosa— y publicarlo lo convierte en una
imagen con la marca de La Tasa afirmando un número que no existe. Eso no se
corrige después: el post ya salió.

- **Se compara contra la última lectura archivada** en `historico_tasas`, que
  es la que ya se publicó y la que el lector tiene delante. No hay referencia
  propia ni una segunda fuente que consultar.
- **El umbral es alto (30 %) a propósito.** No pretende detectar un
  movimiento fuerte —eso es noticia y hay que publicarlo— sino un valor
  imposible. En esta frontera una devaluación real de dos dígitos ocurre, y
  bloquearla sería peor que el fallo que se quiere evitar.
- **Con la referencia vieja no se opina**: si la última lectura archivada
  tiene más de cuatro días, no hay con qué comparar y se deja pasar. Misma
  regla de "sin dato no se inventa un dato" que rige el resto del proyecto.
- **No bloquea en silencio ni para siempre.** El disparo deja la fila en
  `tasas_pendientes` —la misma cola que ya existía para las tasas
  incompletas— y manda el correo. Si el valor era basura, la lectura de dos
  minutos después publica sola; si era real, el admin publica a mano desde
  `/admin/hoy`, que es el botón que siempre publica con lo que haya.
- **El aviso sale del cron que la detecta, no del que reintenta.** Aquel
  corre dos veces al día y este cada dos minutos: avisar en el segundo sería
  un correo cada dos minutos. El seguimiento ya lo cubre el aviso de espera
  larga (intento 15).
- **La guardia se aplica también en el cron de reintento**, aunque no avise:
  si no, el dato imposible saldría dos minutos más tarde y la puerta no habría
  servido de nada.
- `revisarCordura()` **nunca lanza**: si el histórico no responde, se deja
  pasar. Existe para atrapar un dato imposible, no para añadir un motivo nuevo
  por el que el post no salga.

### El pie de tres enlaces es solo para WhatsApp; en Instagram se cierra con hashtags

Existe un pie de tres enlaces —el post, la calculadora y el canal—
(`pieEnlaces()` en `lib/caption.ts`):

```
📲 ¿Quieres ver la publicación de hoy con las tasas actualizadas?
👉 <enlace del post>

🧮 Calculadora de divisas completa:
👉 <SITE_URL>

📢 Únete a nuestro canal oficial de WhatsApp:
👉 <SITE_URL>/wa
```

**Pero no se publica en Instagram.** Ahí no sirve de nada: la plataforma no
vuelve clicables los enlaces dentro del caption, así que solo ocupaban sitio
detrás de los hashtags. Lo que se publica cierra así:

| Post | Cierra con |
| --- | --- |
| Diario de tasas y reporte semanal | "link en la bio" + sus hashtags |
| Noticia (articulo, manual, carrusel, reel) | **hashtags** |

Los hashtags de una noticia son los que el admin escribe en `/admin/noticia`;
en las scrapeadas los pone `buildNewsCaption()` (`HASHTAGS_NOTICIA`), y en las
que redacta la IA los añade `lib/ia-textos.ts` después —igual que el crédito de
la fuente, no se dejan a criterio del modelo, que además tiene instrucciones de
no ponerlos—.

El único sitio donde vive el pie es **`formatMensajeCanal()`**
(`lib/canal-whatsapp.ts`), que arma el mensaje para copiar al canal desde
`/admin/canal`. Ahí los enlaces sí se tocan, y además ya se conoce el permalink
real, así que va directo al post en vez de pasar por un atajo.
`quitarPieEnlaces()` reconoce los tres cierres posibles —hashtags, "link en la
bio" y el pie de los posts anteriores a este cambio— y los sustituye. Los
hashtags se detectan por su forma (un bloque de una línea que empieza con `#`)
y no por una constante, porque cada noticia lleva los suyos.

El bloque del canal se omite si `ENLACE_WHATSAPP` no está configurado, mismo
criterio que ya usaba `enlaceWhatsapp()` para la ruta `/wa` — no publicar un
enlace que no lleva a ningún sitio.

#### `/p/<slug>` se conserva, pero ya no se generan slugs nuevos

Mientras las noticias llevaron el pie, cada una necesitaba un enlace propio al
post que pudiera escribirse *antes* de publicar. De ahí `/p/<slug>`. Al retirar
el pie del caption, los posts nuevos ya no generan slug — pero la ruta se queda:
los posts **ya publicados** lo llevan escrito en su caption y tienen que seguir
resolviendo, y las programadas que quedaron en la cola con `slugEnlace`
congelado se siguen anotando al salir. Lo que sigue vale para todo eso:

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
- **El caption se publica tal cual, sin envolverlo en nada.** Aquí vivía
  `conEnlacePost()` (`lib/publish-news.ts`), el único sitio donde se le añadía
  el pie a los cuatro tipos de post. Se retiró: lo que arma la plantilla —o
  teclea el admin— ya es el caption final, y así lo que se previsualiza es
  literalmente lo que sale. Si se reintroduce cualquier cosa que envuelva el
  caption al publicar, tiene que hacerlo también `materializarParaProgramar`,
  o lo programado dejará de coincidir con lo que se probó con "Publicar".
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
- **Una fila por `(fecha, momento, clave)`, no un JSON por día.** La pregunta
  que se le hace a la tabla es siempre "cuánto valía X alrededor del día D", y
  los huecos son por clave y no por día —el BCV se raspa y puede caerse
  mientras Binance responde—. Con un JSON habría que traer la semana entera y
  desenrollarla para descubrir que justo esa clave venía nula. La clave
  primaria es lo que hace idempotente el upsert: reintentar el mismo disparo no
  duplica nada.

  El `momento` ('manana' o 'tarde') entró con la migración `0005`. Antes la
  clave era `(fecha, clave)` y el disparo de las 6:00 pm **pisaba** al de las
  9:00 am, así que del día solo quedaba la última lectura: suficiente para el
  reporte semanal —que compara semana contra semana— pero no para responder
  "¿cómo estuvo el Binance venta antier a las 6:00 pm?", que es lo que pide
  `/historial`. No se adivina de `capturado_en`: viaja explícito desde el cron
  (`?momento=`), igual que ya decidía el subtítulo del caption. Sin ese
  parámetro —una prueba manual sin él— no se archiva, en vez de inventar bajo
  qué mitad del día guardarlo.
- **La ventana de tolerancia es simétrica** (±3 días). Si el cron falló el lunes
  pero corrió el martes, ese dato sirve y está más cerca que el del viernes
  anterior. En empate entre dos días distintos gana la fecha más antigua, para
  que la comparación no se acorte por debajo de la semana; dentro del mismo día
  gana la **tarde**, que representa mejor cómo cerró esa jornada. No la amplíes
  a diez días: entonces "esta semana" deja de ser una semana.
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

### La alerta de brecha se publica cuando el admin ve que se movió, no por cron

Además del post diario y del reporte semanal, hay una pieza suelta —"URGENTE |
AUMENTA LA BRECHA"— con la brecha de hoy, la de hace una semana y cuánto se
movió entre las dos. Se dispara a mano desde `/admin/brecha`.

- **No tiene cron, y esa es su razón de ser.** Lo que la justifica no es la
  hora sino que la distancia entre el BCV y Binance se movió lo bastante como
  para contarlo; publicarla dos veces al día la convertiría en el post diario,
  que ya existe. Por lo mismo **no se puede programar**: `materializarParaProgramar`
  la rechaza igual que al semanal —sus cifras se resuelven al publicar— y
  además una alerta programada es una contradicción, porque anunciaría un
  movimiento de ayer.
- **La cifra sale de `calcularBrecha()`**, la misma de la portada y de la
  tarjeta del reporte semanal (`lib/brecha.ts`). Esta pieza existe justo para
  llamar la atención sobre ese número, así que sería el peor sitio donde
  publicar una cuenta propia. La comparación contra hace una semana usa
  `leerComparativa()` con la misma ventana de ±3 días que el semanal.
- **Dos variantes, y las elige el admin: con comparación o solo el nivel de
  hoy.** No es una degradada y la otra completa: hay días en que el movimiento
  no es la noticia y el nivel sí, y entonces mencionar la semana pasada solo
  reparte la atención. `construirAlertaBrecha(snapshot, { comparar: false })`
  ni consulta el histórico —sería una lectura a Supabase para un dato que no se
  va a mostrar— y la imagen se pide con `?comparar=0`. Que la ruta acepte esa
  clave no contradice su falta de firma: no falsea ningún dato y es un valor de
  un conjunto cerrado, igual que `proporcion`; lo que la firma evita en
  `instagram-post-news` es texto libre, y aquí sigue sin haberlo.
  `AlertaBrecha.comparada` distingue "no se pidió comparación" de "se pidió y
  el histórico no la tenía": la imagen se ve igual, pero el caption no puede
  decir lo mismo — mencionar un dato que falta cuando nadie lo pidió es
  inventarle un problema al lector.
  Las dos variantes se arman en el servidor y bajan juntas al panel, así que el
  toggle no le pide nada a la red salvo la imagen. Cambiar de variante limpia
  los estados de publicación: un "Publicado" de la otra colgando debajo diría
  que salió esta.
- **El titular lo decide la dirección, no la interfaz** (`titularDe()` en
  `lib/alerta-brecha.ts`): "AUMENTA LA BRECHA" si subió, "BAJA LA BRECHA" si bajó,
  "SE MANTIENE" si no se movió y "ASÍ ESTÁ LA BRECHA" cuando no hay con qué
  comparar. Dejarlo editable permitiría publicar un "aumenta" encima de unas
  cifras que dicen lo contrario, que están justo debajo en la misma imagen. La
  palabra **URGENTE** solo aparece cuando aumenta: ponerla también sobre un
  "baja" la convertiría en decoración.
- **Sin brecha no se publica.** Aquí no vale la degradación a `Sin dato` de la
  portada: aquella muestra un estado y esto produce un post que sale a la
  cuenta real y no se corrige después —mismo criterio que el video de tasas—.
  Lo que sí degrada es la comparación: sin dato de hace una semana la imagen
  sale solo con la brecha de hoy —nunca un `0,0 pp`— y **no explica la
  ausencia**. Al lector no le interesa el estado de nuestro histórico, y una
  línea sobre lo que falta le quita sitio a la única cifra que sí hay; el
  titular ya cambia a "ASÍ ESTÁ LA BRECHA" en vez de anunciar un movimiento
  que no se puede afirmar. Es distinto del semanal, donde `Sin comparación`
  ocupa el hueco de una columna que las otras tarjetas sí llenan. Por lo mismo
  el aviso legal es una función (`avisoBrecha`) y no una constante: la frase
  "comparada con el dato de hace una semana" solo se dice cuando la imagen de
  verdad compara.
- **El color va por impacto y la flecha por signo**, igual que el semanal:
  sube → rojo, baja → verde, y la magnitud viaja en valor absoluto porque el
  signo ya lo dice la flecha. La variación va en **puntos porcentuales**: la
  brecha ya es un porcentaje.
- **Dos lienzos, 1:1 y 9:16, y la Historia sí se publica desde la app.** Misma
  repartición que el reporte semanal —reservas de 110 y 130 px arriba y abajo
  del vertical para que la interfaz de Instagram no tape nada—, pero al
  contrario que aquella esta Historia sale por la Graph API
  (`publishStory`, `destino: "historia"` en `/api/admin/publish-brecha`). La
  limitación de "no se publica desde la app" es específica del semanal, cuya
  Story necesita un sticker de enlace; esta no lleva ningún llamado a la
  acción, igual que las Historias del post diario. La descarga del 9:16 se
  queda para cuando sí se le quiera poner un sticker a mano.
  Feed e Historia son **dos botones y dos estados separados**: se publican por
  separado y a veces sale solo uno, así que un estado compartido dejaría el
  "Publicado" de uno colgando bajo el botón del otro. Mientras uno sale, los
  dos se bloquean: los dos releen las tasas en el servidor y dispararlos a la
  vez son dos descargas de imagen para Meta sin ninguna necesidad.
- **La franja del titular va de borde a borde y con un rojo propio.** El
  relleno lateral del lienzo lo ponen los bloques y no el contenedor raíz,
  justo para que esa franja pueda llegar a los dos bordes: así se lee como un
  rótulo de noticiero y no como otra píldora más de las que ya tiene la imagen.
  El rojo (`ROJO`, local a la ruta) es más vivo que `COLOR.danger`, que está
  calibrado para la columna de variaciones del semanal —texto pequeño sobre
  fondo oscuro— y aquí, sosteniendo una franja entera con una foto detrás,
  se leía apagado. No se toca el token global: el semanal sigue con el suyo,
  donde el problema no existe. Lo usan también la flecha, la variación y el
  borde de la tarjeta de hoy, para que haya un solo rojo y no dos parecidos.
- **La foto de fondo va embebida y apagada bajo un velo.** Vive en
  `app/api/og/_assets/fondo-brecha.jpg` y se lee como data URI, igual que las
  fuentes y los SVG del pie: pedirla por red desde dentro de la misma función
  que Meta está esperando es un viaje que puede fallar sin necesidad. Va como
  capa `<img>` y no como `backgroundImage` porque Satori no compone varias
  capas de fondo y aquí hacen falta dos —la foto y el velo—. Encima, las
  cifras se apoyan en un panel semitransparente: sobre la foto a la vista, el
  gris de las etiquetas y del aviso legal deja de leerse. El original mide
  412×512, así que se escala bastante; si algún día hay una versión más grande,
  se sustituye el archivo y ya.
- **La imagen va sin firma HMAC**, como `instagram-semanal`: no recibe ni un
  carácter de texto libre —lee las tasas y el histórico del servidor— y su
  única entrada es un valor de un conjunto cerrado.
- Se itera con `npx tsx scripts/preview-brecha.ts`, que imprime el caption y
  las dos URLs; `--sin-historico` enseña la degradación sin esperar. Ese flag
  vive **en el script y nunca en la ruta**, por lo mismo que en el semanal.

### `/historial` enseña lo archivado, y por eso el histórico guarda mañana y tarde

El histórico nació para el reporte semanal, pero la pregunta que de verdad
llega es otra: "¿a cómo estaba el Binance venta antier a las 6:00 pm?".
`/historial` la responde, y es lo que obligó a que `historico_tasas` distinga
los dos disparos del día (ver la sección anterior).

- **Dos vistas, las mismas dos que se publican**: en bolívares —una tasa a la
  vez, la que se elige arriba— y en pesos, con las cuatro filas de
  `lib/pesos.ts` juntas. En pesos no hay selector de tasa suelta a propósito:
  así es como salen en la diapositiva del post, y separarlas rompería la
  comparación que esa vista propone. `listarHistoricoPesos()` las reconstruye
  con la misma lógica que el post —la TRM tal cual, las tres de frontera
  cruzando por `COP_FRONTERA`— así que el historial y lo publicado no pueden
  decir cosas distintas. `VES` no se pide: vale 1 por construcción, y el
  bolívar promedio se simplifica a `1 ÷ COP_FRONTERA`, el mismo atajo que ya
  usa `buildFilasPesos()`.
- **La vista y la tasa viajan por query string** (`?vista=` y `?clave=`), no en
  estado de cliente: la página ya se renderiza en el servidor y un enlace
  normal resuelve el caso sin JavaScript, mismo criterio que el `?actualizar=`
  de la portada.
- **Lleva cabecera de CDN** (`s-maxage=600` en `next.config.ts`, junto a la de
  la portada y por el mismo motivo). `lib/historico.ts` consulta con
  `no-store`, lo que vuelve dinámica la página, así que sin esa cabecera cada
  visita —y cada cambio de pestaña o de tasa, que son navegaciones nuevas—
  sería un viaje a Supabase para datos que solo cambian dos veces al día. Es la
  misma consulta-por-visitante que la portada ya tiene prohibida.
- **El sparkline es SVG a mano** (`components/Sparkline.tsx`), sin librería de
  gráficos: añadir una costaría más de cien kilobytes en una app pensada para
  señal intermitente. Es componente de servidor, así que no lleva ni una línea
  de JavaScript al navegador. Va **solo en la vista en bolívares**: la de pesos
  muestra cuatro series a la vez y una sola línea sin leyenda sería ambigua.
  Con menos de dos puntos no dibuja nada, y una serie plana va centrada en vez
  de dividir entre cero.
- **El service worker la cachea aparte de la portada.** Ver la sección de las
  tres cachés: cada navegación se guarda bajo su propia ruta justamente porque
  esta página lo destapó.

### Las analíticas son propias, y por eso hay una tabla de eventos

`/admin/analiticas` junta las dos mitades del proyecto en una pantalla: qué
hace la gente en la calculadora y cómo le va a lo que se publica en Instagram.

- **Vercel Analytics se queda, pero no responde lo que aquí se pregunta.**
  Cuenta visitas y rutas; no sabe qué es una conversión en esta app, con qué
  moneda se hace, cuántas veces se copia la cifra que va a viajar por WhatsApp,
  ni cuánta gente abre la app instalada o llega a usarla sin señal. Esas son
  las preguntas que deciden qué se publica y qué se arregla, así que el evento
  se registra en `eventos_web` (migración `0010`), en la misma base que ya usa
  el resto del proyecto.
- **Anónima por diseño.** No se guarda IP, ni user-agent, ni una sola cosa
  tecleada por el usuario — el monto que escribe es asunto suyo, y el `detalle`
  de una conversión es solo la moneda de origen, de conjunto cerrado. `sesion`
  es un identificador aleatorio que vive en el `sessionStorage` de una pestaña
  y muere con ella: existe para no contar diez veces a quien prueba diez
  montos, no para seguir a nadie. Del referente se guarda **solo el host**.
- **La fecha la pone el servidor**, con `diaCaracasISO()`, no el navegador: el
  reloj de un teléfono se mueve y esa columna es la que agrupa el panel entero.
  Mismo criterio de "el día se corta en Caracas" que `historico_tasas`.
- **`/api/eventos` siempre contesta 204**, incluso ante un cuerpo inválido o un
  Supabase caído. Quien llama es un `sendBeacon` que no mira la respuesta, y un
  4xx solo convertiría la ruta en un oráculo de qué acepta. La defensa es que
  el `tipo` esté en un conjunto cerrado y cada texto se recorte
  (`normalizarEvento`): es la única ruta pública que escribe en Supabase.
- **No hay cola de eventos en el dispositivo.** Sin red no se registra nada, y
  es una renuncia deliberada: reenviar eventos viejos horas después falsearía
  la hora a la que ocurrieron, que es la mitad de lo que se mide. La excepción
  es `sin_conexion`, que se anota **al volver la conexión** — lo que interesa
  no es el instante sino que esa sesión llegó a usar la app sin señal, que es
  la pregunta que justifica el service worker.
- **`/admin` no se cuenta.** El panel lo usa una sola persona varias veces al
  día, y contarlo inflaría justo las cifras que se miran para saber si la app
  le sirve a alguien más.
- **El resumen se agrupa en la base**, con la función `analiticas_web(desde,
  hasta)` de la misma migración: PostgREST no agrupa, y la alternativa era
  traerse decenas de miles de filas a una función serverless para contarlas.
  Es un solo viaje y devuelve el panel entero.
- **Las dos mitades degradan por separado.** Un Supabase caído no puede dejar
  sin métricas de Instagram ni un token caducado sin las de la web. Dentro de
  la mitad de redes, además, **cada métrica degrada por su cuenta**
  (`lib/instagram-insights.ts`): la Graph API retira y renombra métricas sin
  aviso y oculta varias en cuentas pequeñas, así que se piden **una por una**
  —pedirlas en lote hace que una sola métrica no disponible tumbe las demás— y
  lo que falla se muestra como `—`, nunca como `0`.
- **La única sugerencia del panel es la franja horaria**, y por eso lleva su
  propia letra pequeña. `compararFranjas()` (`lib/instagram-insights.ts`) mira
  las últimas 50 publicaciones, las parte en mañana y tarde por su hora **de
  Caracas** y compara la **mediana** de me gusta más comentarios — mediana y
  no promedio porque un post viral desplazaría a su franja y haría recomendar
  una hora por una casualidad. Se mide con interacciones públicas y no con el
  alcance porque aquel exige una llamada de `insights` por publicación, o sea
  cincuenta por cada visita a la pestaña. Con menos de cinco posts en alguna
  franja, o con una diferencia por debajo del 15 %, **no recomienda**: dice que
  todavía no se puede responder o que están parejas. Una recomendación sacada
  de dos posts es una corazonada con cara de dato.
- **Instagram no devuelve métricas de cuenta más allá de 30 días.** El selector
  ofrece igualmente 90, que estira solo la mitad web, y la pantalla lo dice en
  vez de recortar la opción: "cómo viene el trimestre en el sitio" es una
  pregunta legítima aunque Instagram no la acompañe.
- **`lib/instagram-insights.ts` vive aparte de `lib/instagram.ts`**: aquel
  publica —cada llamada escribe en la cuenta real y es irreversible— y este
  solo pregunta. Comparten `GRAPH_BASE` y `credenciales()` para que un cambio
  de versión de la Graph API no se aplique a la mitad, y nada más.
- **Los gráficos son SVG a mano** (`components/admin/BarrasDias.tsx`), sin
  librería, por lo mismo que `components/Sparkline.tsx`. Barras y no línea
  porque lo que se compara son días sueltos, no una tendencia continua.
- **Son tres pestañas —Calculadora, Enlaces e Instagram— y no una página
  larga.** No se comparan entre sí: nadie lee "sesiones de la calculadora" al
  lado de "alcance del post" para sacar una conclusión, y juntas obligaban a
  bajar media pantalla en el teléfono. Separadas, además, **cada una se carga
  sola**: mirar la calculadora ya no gasta las cinco llamadas a la Graph API
  de la pestaña de Instagram. Cambiar de pestaña conserva el período elegido
  —cambiar de mitad no es cambiar de pregunta—.
- **La pestaña de Enlaces cuenta los atajos del dominio** (`/hoy`, `/wa`,
  `/ig`, `/laparada` y `/p/<slug>`), que son los que viajan en los captions de
  Instagram y en el mensaje del canal. Es también lo único que se puede
  responder sobre el canal de WhatsApp: **cuánta gente lo abre desde aquí**.
  De sus seguidores o del alcance de cada mensaje no hay forma de saber nada
  —no existe API de Canales, que es el mismo motivo por el que `/admin/canal`
  arma el mensaje para pegarlo a mano— y un número tecleado a mano en un panel
  envejece mintiendo, así que no se inventó una pestaña de canal.
- **`/wa` y `/ig` dejaron de ser `redirects()` de `next.config.ts`** y ahora
  son routes (`app/wa/route.ts`, `app/ig/route.ts`) que anotan el clic y
  devuelven el mismo 307 de antes. El motivo es exactamente ese: un
  `redirects()` lo resuelve la CDN sin ejecutar código nuestro, así que no
  había forma de contar nada. El 307 se arma a mano en vez de con
  `Response.redirect()` para poder ponerle `no-store`: una redirección
  cacheada dejaría de pasar por la ruta y el clic no se contaría. Lo demás no
  cambia — sin `ENLACE_WHATSAPP`, `/wa` sigue siendo un 404.
- **El clic en un atajo se anota en el servidor, no al hidratar.** `/wa` y
  `/ig` no sirven HTML donde pudiera correr nada, y `/hoy`, `/laparada` y
  `/p/<slug>` redirigen con un `<meta refresh>` inmediato: un evento del
  navegador llegaría tarde la mitad de las veces. La contrapartida es que ahí
  sí pasan los rastreadores —el de WhatsApp pide `/hoy` cada vez que alguien
  pega el enlace en un chat— y contarlos inflaría justo la cifra que se mira,
  así que `registrarAtajo()` los descarta por user-agent. Es un filtro burdo a
  sabiendas: los que importan se anuncian con todas las letras, y el error de
  los que no se declaran es mucho menor que el de contarlos todos.
- **Los atajos se cuentan por clics y no por sesiones distintas**, y quedan
  **fuera del listado general de referentes**: al registrarse en el servidor
  cada clic trae su propia `sesion`, así que contar sesiones sería contar lo
  mismo con otro nombre, y mezclarlos taparía de dónde llega el tráfico que sí
  se queda en el sitio. Tienen su propia lista de referentes.
- **En la nav va suelta, justo debajo de Inicio**, fuera de los tres grupos
  (`ENLACES_SUPERIORES` en `nav-admin.ts`). Los grupos son cosas que se
  *disparan* sobre una sección concreta; estas dos son la mirada de conjunto,
  y a media lista es donde no se busca un panorama.
- **Los controles se pintan antes que los datos.** Cada bloque cuelga de un
  `<Suspense>` con su propio esqueleto (`EsqueletoAnaliticas`), de modo que al
  cambiar de pestaña o de período las pestañas y el selector siguen en
  pantalla y solo se repinta el contenido; antes, la pantalla entera se
  sustituía por el esqueleto genérico de `/admin` y se perdía de vista dónde
  se había pulsado. La `key` del `Suspense` es lo que lo hace suspender de
  nuevo en cada cambio: sin ella React reutilizaría el subárbol y dejaría las
  cifras viejas mientras llegan las nuevas, que en un panel de cifras se lee
  como un dato que no cuadra. Este esqueleto **sí imita la página**, al
  contrario que el de `/admin`: esta pantalla tiene siempre la misma forma
  —cuatro cifras, una serie, dos listas— así que no hay nada que mantener
  sincronizado y el contenido no salta al aparecer.
- **Tres niveles de fallo, y cada uno se ve distinto**: una métrica que la
  fuente no expone sale como `—`; una lectura fallida de Supabase, como aviso
  dentro del bloque, diciendo que las tasas y la publicación no dependen de
  esto; y lo imprevisto lo recoge `error.tsx` del propio segmento, con un
  botón de reintentar —`reset()` reintenta el render sin recargar, que es lo
  que hace falta cuando falla una lectura de red— y sin tumbar el resto de
  `/admin`, porque el boundary vive en este segmento y no en el layout.
- El período y la pestaña viajan por query string (`?dias=` y `?vista=`), como
  el `?vista=` de `/historial`, y la página **no lleva cabecera de CDN**: cuelga de la sesión
  de `/admin`, la abre una sola persona y cachearla serviría cifras viejas
  justo a quien las está mirando para decidir.

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
- **La cola va agrupada por día**, con un encabezado ("Hoy", "Mañana" o la
  fecha) y cuántas publicaciones lleva cada uno; la fila solo dice la hora.
  Una lista plana de fechas repetidas obliga a leer la fecha de cada fila para
  saber si dos van el mismo día, y la hora —que es lo que de verdad se
  compara— quedaba detrás de ella. El día se calcula en Caracas, como todo lo
  demás: desde Cúcuta el teléfono va en UTC−5 y agrupar por su medianoche
  partiría en dos un día de allá.
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
- **La imagen de la vista previa es la que se publicó, no una recalculada.**
  `/api/og/instagram-post` y `/api/og/instagram-post-pesos` sirven dos cosas
  distintas: la descarga que hace Meta al publicar y la vista previa de `/hoy`,
  que se vuelve a pedir cada vez que alguien abre ese enlace — por ejemplo al
  pegar el mensaje en el canal media hora más tarde. Mientras leyeron
  `getRates()` en vivo, un Binance que se moviera entre medias dejaba la imagen
  diciendo una cifra distinta de la que ya estaba escrita en el caption
  publicado: el mismo post afirmando dos números para la misma tasa. Ahora el
  cron congela el snapshot con el que arma el caption (`lib/snapshot-hoy.ts`,
  tabla `snapshot_hoy`, una sola fila que se sobreescribe en cada disparo) justo
  antes de publicar, y las dos rutas leen `snapshotDelDia()`. Si no hay nada
  congelado —arranque en frío, o Supabase caído— caen a las tasas en vivo, que
  es peor que la consistencia buscada pero mejor que una imagen rota. No es
  histórico: para eso está `historico_tasas`, que sí conserva mañana y tarde.
- `/hoy` va con `Cache-Control: no-store` desde `next.config.ts`, junto a la cabecera
  de la portada. Si la CDN se queda una copia, el enlace lleva toda la tarde al post
  de la mañana.
- **El service worker tiene que dejarla pasar.** Sin la guarda de `ATAJOS` en
  `public/sw.js`, `/hoy` se serviría de la caché de navegación —su propia copia,
  desde el cambio de clave por ruta— en vez de resolver en el servidor a dónde
  lleva hoy. Al tocar eso se sube `VERSION`.
- **`/wa` no tiene respaldo en el código**, al contrario que `/ig`: un número de
  WhatsApp no se adivina y uno inventado mandaría a un chat ajeno. Sin
  `ENLACE_WHATSAPP` la ruta simplemente no existe.

### "Dólar en La Parada" detecta solo, pero publica un humano

Además de las tasas propias, La Tasa republica a diario la columna de
lanacionweb.com sobre el cambio informal de dólares en La Parada (Villa del
Rosario, frontera con Cúcuta), citando `@lanacionweb` y a quien la firme como
fuente. Es la única serie del proyecto que combina un cron que vigila un sitio
de terceros con una cola de un solo elemento que un humano tiene que aprobar
antes de que salga nada.

- **El cron detecta, nunca publica.** `app/api/cron/vigilar-parada/route.ts`
  revisa la categoría "Frontera" de lanacionweb.com (`lib/providers/parada.ts`,
  regex sobre el HTML del listado — el sitio no tiene API) cada pocos minutos,
  porque la columna no sale a una hora fija y algunos días no sale. Si el
  título del artículo más reciente cambió respecto al que ya tenía guardado,
  scrapea el cuerpo con el mismo `fetchArticle()` que usa `/admin/noticia`
  (`lanacionweb.com` ya estaba en `CONTENEDOR_POR_HOST`) y guarda un borrador
  nuevo en `parada_pendiente` (tabla de una sola fila, mismo patrón que
  `snapshot_hoy`) — pero **no publica**. Extraer el cuerpo con una expresión
  regular sobre prosa libre ya falló una vez en producción (texto de un
  artículo distinto colándose en el scrapeado), y esta es la peor serie para
  que eso pase en silencio: es justo el número que el lector se lleva de un
  vistazo. Por eso, y por el mismo criterio de "revisión humana" que ya rige
  `/admin/noticia`, un humano confirma antes de que salga nada.
- **`compra` y `venta` arrancan vacíos a propósito.** El cron guarda título,
  imagen y caption sugerido, pero dejar el lugar en su valor por defecto
  (`LUGAR_PARADA_DEFECTO`, "La Parada, Villa del Rosario") y `compra`/`venta`
  en `null` — nunca intenta leerlos del cuerpo del artículo. El admin los
  confirma a mano en `/admin/parada`, leyendo el artículo original, antes de
  que el botón "Publicar ahora" se habilite.
- **El correo de aviso es de conveniencia, no un requisito.** Lo manda
  `lib/notificar.ts` (ver más abajo) justo después de guardar un borrador
  nuevo: si el correo falla, el borrador ya quedó guardado y `/admin/parada`
  lo sigue ofreciendo igual.
- **La imagen es una plantilla dedicada, no una variante de la de noticia.**
  `/api/og/instagram-post-parada` no recibe título/imagen/cifras por query
  string —a diferencia de `instagram-post-news`— sino que lee el borrador
  directo de `parada_pendiente`, igual que `/api/og/instagram-post` lee
  `snapshotDelDia()`. Por eso **no lleva firma HMAC**: nada de lo que dibuja es
  texto que alguien pueda controlar armando la URL. Muestra el lugar, el
  título, la foto del artículo y las cifras de compra/venta como dos tarjetas
  dentro del marco (no enterradas en un párrafo), con un aviso legal propio
  —"tasa informal... puede variar durante el día"— distinto del genérico de
  noticia.
- **`/admin/parada` guarda antes de mostrar.** El botón "Actualizar vista
  previa" hace un `PATCH` a `/api/admin/parada` (lugar/compra/venta/caption)
  y solo entonces refresca el `<img>` con un parámetro que cambia — mismo
  truco que el `?actualizar=` de la portada, porque la plantilla no toma nada
  por query string y sin eso el navegador serviría su propia copia. Es la
  razón por la que un cambio de copy o de plantilla **no se nota en un
  borrador ya guardado**: hay que volver a guardar (o esperar al próximo
  artículo que detecte el cron) para que se refleje.
- **`/laparada` es `/hoy`, calcado.** Mismo motivo, misma solución: página con
  `<meta refresh>` y Open Graph propio (no una redirección 307) para que el
  rastreador de WhatsApp se quede con la tarjeta en vez de toparse con el muro
  de login de Instagram. `destinoDeLaParada()` en `lib/enlaces.ts` usa los
  mismos dos respaldos que `/p/<slug>` (tabla → perfil, sin variable de
  entorno intermedia) y se anota justo después de publicar, en
  `/api/admin/publish-parada`. Está en `ATAJOS` de `public/sw.js` y en las
  cabeceras `no-store` de `next.config.ts`, igual que `/hoy`.
- **La portada muestra una tarjeta aparte, nunca una moneda más.** Todas las
  demás tasas de la calculadora se leen en vivo de un proveedor; esta la
  confirma el admin a mano, una vez al día, y algunos días no hay dato en
  absoluto. Mezclarla en `RATE_ORDER` daría una imagen falsa de qué tan fresca
  es. `ParadaCard` (en `app/page.tsx`, vía `paradaDelDia()` en `lib/parada.ts`)
  solo muestra un borrador **ya publicado** —nunca uno a medio revisar en
  `/admin/parada`— y va cacheada 5 minutos con `withCache`, el mismo TTL que
  `getRates()`: sin eso sería la misma consulta a Supabase por visitante que
  el proyecto ya prohíbe para `historico_tasas`.

### El token de Instagram se renueva solo, y por eso está guardado

El token de larga duración vale 60 días y vivía únicamente en
`IG_ACCESS_TOKEN`. Cuando caducaba no se rompía nada visible: el cron de las
9:00 simplemente dejaba de publicar, y uno se enteraba mirando el feed. Es el
fallo más caro del proyecto porque es silencioso.

Meta **no expone ningún endpoint que diga cuánto le queda a un token** de este
flujo (verificado en la documentación de "Instagram API with Instagram
Login"): la única vía es `GET /refresh_access_token?grant_type=ig_refresh_token`,
que devuelve un token **nuevo** junto con su `expires_in`. O sea que vigilar la
caducidad obliga a guardar el resultado del refresco, y de ahí la tabla
`token_instagram` (migración `0012`, una sola fila, mismo patrón que
`snapshot_hoy`).

- **El entorno sigue siendo la semilla y el respaldo.** `tokenActual()` prefiere
  la fila guardada y cae a `IG_ACCESS_TOKEN` sin fila o con Supabase caído —o
  sea, exactamente el comportamiento anterior—. Esto añade vigilancia, no un
  punto único de fallo, y por eso `credenciales()` pasó a ser `async`: es el
  único cambio que la publicación notó.
- **La lectura va cacheada cinco minutos** (`lib/cache.ts`, el mismo TTL que
  `getRates()`): publicar un carrusel son cuatro o más llamadas a la Graph API
  y no pueden ser cuatro consultas a Supabase por la misma fila. Al renovar se
  olvida esa entrada (`olvidar()`), porque el sentido de renovar es dejar de
  usar el token viejo.
- **El cron es diario y conservador.** `app/api/cron/refrescar-token-ig` no
  llama a Meta si todavía quedan más de 20 días; Meta además exige que el token
  tenga al menos 24 horas. Un disparo al día deja veinte oportunidades antes de
  que la fecha apriete. Un fallo sí devuelve 502, para que se vea en rojo en
  cron-job.org: si el refresco falla varios días seguidos, el token muere.
- **El panel solo habla cuando hay algo que hacer**: con el token sano, `/admin`
  no dice nada; por debajo de 10 días —o sin registrar, o ya caducado— aparece
  la franja ámbar. Mismo criterio que las insignias de las tarjetas.
- **La cuenta atrás va siempre, el aviso solo cuando toca.** Con el token sano
  el pie de `/admin` muestra una línea gris con los días que quedan y cuándo se
  renovó: "¿cuánto le queda?" es una pregunta legítima aunque la respuesta sea
  tranquilizadora, y antes no tenía dónde responderse. Es el mismo componente
  (`components/admin/EstadoToken.tsx`) el que sale arriba en ámbar cuando de
  verdad hay algo que hacer, porque ese caso no puede esperar a que alguien
  baje a buscarlo.
- **La franja lleva su propio botón de renovar**
  (`components/admin/AvisoToken.tsx` → `/api/admin/token-instagram`), que
  fuerza el refresco saltándose el umbral de veinte días. Es lo que permite
  **inicializar la tabla** sin esperar al cron ni disparar un curl con el
  `CRON_SECRET` desde el teléfono, y rescatar el caso de que el cron lleve
  días fallando. Renovar de más no cuesta nada: el token nuevo vale 60 días
  desde que se pulsa. Va protegido por la cookie de sesión, no por
  `CRON_SECRET`, que nunca llega al navegador.
- La tabla lleva RLS **y** los privilegios retirados a `anon`/`authenticated`:
  con RLS sin políticas ya no se vería ninguna fila, pero esta guarda una
  credencial y conviene que PostgREST responda "permiso denegado" en vez de una
  lista vacía.

### Los avisos por correo viven en un solo sitio

`lib/notificar.ts` empezó siendo `notificar-parada.ts` y avisaba de una sola
cosa —el borrador nuevo de La Parada— mientras los fallos de verdad seguían
siendo silenciosos: si el cron de las 9:00 no publicaba, uno se enteraba
mirando el feed. Ahora todos los puntos donde algo se queda a medias pasan por
ahí.

| Cuándo | Quién lo dispara |
| --- | --- |
| Borrador nuevo de La Parada | `cron/vigilar-parada`, tras guardarlo |
| El cron de tasas no pudo publicar | `cron/publish-instagram`, en su `catch` |
| El post lleva media hora esperando a las fuentes | `cron/publicar-tasas-pendientes`, al intento 15 |
| Una programada terminó en `fallida` | `cron/publicar-programadas` |
| No se pudo renovar el token de Instagram | `cron/refrescar-token-ig` |
| El resumen del día, a las 8:00 pm | `cron/resumen-dia` |

Tres reglas:

- **`notificar()` nunca lanza.** Un correo que no sale no puede convertir una
  publicación correcta en un error que invite a reintentar y duplique el post
  — mismo criterio que `guardarEnlace()` y `calentarVideo()`. Por eso quien
  llama ya no lo envuelve en `try/catch`.
- **Sin `RESEND_API_KEY` o sin destino, se omite en silencio.** Todo lo que se
  avisa sigue estando en `/admin` de todas formas. `NOTIFICAR_EMAIL` es la
  variable general y `NOTIFICAR_PARADA_EMAIL` se sigue aceptando: renombrarla
  no puede dejar sin avisos a una instalación que ya funcionaba.
- **Se avisa de lo que pide una persona, no de cada intento.** Los crons que
  reintentan solos avisan **una vez**, cuando la espera deja de ser normal: el
  de tasas pendientes compara `intentos === 15` con igualdad estricta
  justamente para que el correo no salga cada dos minutos. Un aviso repetido
  se convierte en ruido que se ignora, que es peor que no avisar.
- **El resumen del día es la excepción a todo lo anterior**: es el único que
  se manda *aunque no pase nada*, y por eso va a una hora fija en vez de en
  respuesta a un fallo. Su valor está en llegar todos los días, para que un
  día raro se note por contraste. `lib/resumen-dia.ts` junta lo que ya miden
  el histórico, la analítica propia y la Graph API —no calcula nada nuevo— y
  cada bloque falla por su cuenta: lo que no se pudo leer sale como "sin dato"
  y nunca como cero, que sería mentir sobre un día que a lo mejor estuvo bien.
  Si **nada** se pudo leer no se manda correo, porque un mensaje que solo dice
  "sin dato" cuatro veces es ruido y el fallo que lo causó ya avisa aparte.
- **El aviso del fallo de publicación va en la ruta del cron y no dentro de
  `publicarTasasDelDia()`**: lo que hay que reportar es "el disparo de las
  9:00 no publicó", y solo la ruta sabe de qué disparo se trata — la función
  la comparten también el botón manual y la cola de pendientes.

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
- **`sanearTextoIa()` quita las URLs y el markdown.** Las primeras porque un
  enlace inventado por el modelo mandaría al lector a cualquier parte, y el
  único pie con enlaces que existe lo arma `formatMensajeCanal()` para el canal;
  el segundo porque Instagram no lo interpreta y saldrían los asteriscos a la
  vista. Ni el crédito de la noticia (`Fuente: <host>`) ni los hashtags se dejan
  al criterio del modelo: los dos se añaden después en `lib/ia-textos.ts` —el
  crédito con el hostname de la URL que se pidió publicar, igual que hace
  `buildNewsCaption()`, y los hashtags con la misma constante que esa
  plantilla—, de modo que el caption de la IA cierre exactamente igual que el
  de plantilla.
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

### El video de tasas se genera de la publicación, no de las tasas en vivo

Además de los posts, hay un **Reel vertical** (1080×1920, 10 s) con las cuatro
tasas del día y la brecha de remate. Vive en `videos/tasas-del-dia/` —una
composición de HyperFrames, que renderiza video desde HTML— y se dispara a mano
con `npx tsx scripts/video-tasas.ts --render`, nunca por cron: sale los domingos
o cuando convenga, y conviene mirarlo antes.

- **Lee `snapshot_hoy`, no `getRates()`.** El video se comparte junto al post de
  esa jornada, así que tiene que decir exactamente lo mismo. Leyendo las tasas en
  vivo, un Binance que se moviera entre el post y el render dejaría el video
  afirmando una cifra distinta de la que la gente ya tiene en el feed — el mismo
  fallo que obligó a congelar el snapshot para `/api/og/instagram-post`. El flag
  `--en-vivo` existe solo para probar el diseño fuera de las horas de
  publicación, y avisa por consola de que lo generado no corresponde a ningún
  post.
- **El script no calcula ni una cifra.** La brecha sale de `calcularBrecha()` y
  la fila en pesos de `buildFilasPesos()`; las etiquetas y las fuentes se leen
  del snapshot. Es la regla de siempre llevada a un consumidor más: si el video
  hiciera su propia cuenta, podría publicar un porcentaje distinto del que la app
  lleva todo el día en pantalla.
- **La fila en pesos nombra la venta.** Se probó con el `mid` de Binance y es
  justo el promedio que este proyecto prohíbe. Vale el mismo criterio que la
  brecha: una cifra suelta tiene que nombrar un lado del mercado.
- **Si falta una tasa, no se genera el video.** Aquí no vale la degradación a
  `Sin dato` de la portada o el semanal: aquellas muestran un estado y esto
  produce un archivo que se sube a Instagram y no se corrige después.
- **La fecha y la hora salen del snapshot, no del reloj de la máquina.** Lo que
  fecha la pieza es el instante en que se capturaron las tasas, que es el que el
  lector puede contrastar con el post. Un video generado el lunes sobre el post
  del domingo dice la hora del domingo, y eso es lo correcto.
- **Los datos entran por variables de HyperFrames**, declaradas en
  `data-composition-variables`; los números escritos en el HTML son solo el
  respaldo para abrir el archivo suelto. Ojo: **el Studio reescribe ese atributo**
  convirtiendo sus comillas en `&quot;`, y aunque el navegador lo entiende, `lint`
  lee el archivo en crudo y lo rechaza. Si sale
  `invalid_composition_variables_declaration`, la causa es esa.
- **La voz no se genera aquí.** El TTS local solo tiene una voz en español,
  documentada como peninsular y sin control de emoción — mal encaje para el
  público de la frontera. El guion y la dirección de voz están en
  `videos/tasas-del-dia/GUION.md` y se pegan en CapCut. Los efectos sí van
  incrustados, mezclados bajos (pico −6,4 dB) para dejarle cabecera a esa voz.
- `formatFechaLarga()` se añadió a `lib/format.ts` en vez de duplicar los meses
  en el script: las fechas se arman en un solo sitio, por lo mismo que están
  hechas a mano y no con `Intl`.

#### El generador de `/admin/video` y por qué el render va a la nube

La misma pieza se genera desde el teléfono, en `/admin` → **Generador de
videos** → *Resumen de tasas*: enseña el copy del último post y, debajo, el
botón que arma el Reel con esas mismas cifras, su vista previa y su descarga.

- **El copy se reconstruye, no se pide a Instagram.** `buildCaption()` sobre el
  snapshot congelado es la misma función y el mismo snapshot que usó el cron, así
  que sale idéntico al publicado — y la pantalla no depende de que la Graph API
  responda para enseñar algo que ya ocurrió. El `momento` se deduce de la hora de
  captura, porque `snapshot_hoy` guarda una sola fila y no lo lleva.
- **El render lo hace HeyGen, no Vercel.** Necesita Chromium y `ffmpeg`, que no
  caben en una función serverless — la misma restricción que llevó a marcar los
  videos en Cloudinary. `lib/video-nube.ts` habla con su API por `fetch`, sin el
  CLI: cabecera `x-api-key`, `POST /v3/hyperframes/renders` y sondeo de
  `GET /v3/hyperframes/renders/{id}`. El esquema no está adivinado, sale del
  cliente del propio CLI.
- **La plantilla se sube una sola vez** y su `asset_id` vive en
  `HYPERFRAMES_ASSET_ID`; cada generación reenvía solo las variables del día. Sin
  eso habría que subir el proyecto entero en cada petición, que ni cabe en el
  minuto de la función ni tiene sentido para unos números que cambian.
- **Encolar y sondear van separados**, como la cola de programadas y por el mismo
  motivo: el render ronda el minuto y una función de Vercel muere ahí.
  `/generar` devuelve el `renderId` y la interfaz pregunta por `/estado` cada
  cinco segundos.
- **La URL firmada de HeyGen no llega al navegador.** El video se pide siempre a
  `/api/admin/video/archivo`, que exige la cookie de sesión y hace de
  intermediaria — mismo criterio que las credenciales de Cloudinary. Nada se
  escribe en `public/`: ahí quedaría accesible sin sesión, y en Vercel el disco
  es de solo lectura.
- **Sin las dos variables de entorno cae al render local**, que es lo cómodo en
  desarrollo y no gasta créditos. Se prefiere la nube cuando está configurada
  para que lo que se prueba sea lo que va a pasar en producción.

### Una dirección equivocada cae en una pantalla propia, no en la de Next

`app/not-found.tsx`. La página por defecto de Next —fondo blanco, tipografía
del sistema, "404 | This page could not be found"— se lee como "el sitio se
rompió" y encima parece otro sitio distinto, que es lo peor que puede pasar
cuando alguien llega con un enlace mal copiado desde WhatsApp.

Lo que importa no es el 404 sino la salida: el botón grande va a la
calculadora, que es a lo que venía casi todo el que aterriza aquí, y debajo
queda `/historial` como el otro destino que alguien puede estar buscando. Es
estática y sin JavaScript, así que también sirve servida por el service worker
sin conexión.

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

Cuelgan ocho páginas de esa misma sesión —`/admin/hoy`, `/admin/parada`,
`/admin/noticia`, `/admin/analiticas`, `/admin/semanal`, `/admin/brecha`,
`/admin/canal` y `/admin/video`—, más `/admin` como dashboard de entrada. Siguen siendo páginas separadas y no
pestañas de una: la de noticias es un formulario con estado propio —switch
Post/Reel, subidas, previa desactualizada, cola— y el reporte semanal **no
tiene entradas**: se mira y se publica.

`/admin/hoy` es el escape valve del cron de tasas: dispara el mismo carrusel
de bolívares/pesos que `app/api/cron/publish-instagram/route.ts`, pero sin
`momento` —así no pisa el registro de `historico_tasas` de las 9:00 am o las
6:00 pm con una lectura que no es ninguna de las dos— y con el caption cayendo
a "Actualización del día" en vez de "de la mañana/tarde". Existe porque un
BCV que falla a las 9:00 y responde a las 9:20 antes no tenía forma de
corregirse sin esperar al disparo de la tarde.

#### Cada pantalla dice de cuándo es lo que muestra

`components/admin/SelloDeHora.tsx`, bajo el título de la sección. La app
pública lo tiene desde el principio —cada tarjeta de tasa lleva su fuente y su
antigüedad— y en el panel faltaba, justo donde más decide: aquí se mira una
cifra para decidir si se publica, y una lectura de hace dos horas y una de
hace dos minutos no valen lo mismo.

Lleva la hora **y** el "hace tanto": la hora es lo que se puede contrastar con
el post ya publicado, y el relativo responde de un vistazo si el dato todavía
sirve. Cada pantalla fecha lo suyo — `/admin/semanal` y `/admin/brecha`, las
tasas del snapshot; `/admin/parada`, cuándo se **detectó** el borrador (su
antigüedad es lo que dice si sigue siendo la columna de hoy); `/admin/analiticas`
y la agenda, el momento de la lectura. `/admin/hoy` ya lo tenía.

#### Publicar pide confirmación en todas partes

Todo botón que manda algo a la cuenta real —tasas, La Parada, noticia, video,
semanal y las dos variantes de la alerta de brecha— pasa por un
`window.confirm` que nombra lo que va a salir y avisa de que no se deshace.
Lo tenían `/admin/hoy` y `/admin/parada` desde el principio y faltaba en el
resto, que es donde más falta hacía: en el teléfono ese botón queda a un dedo
de distancia mientras se revisa la imagen, y publicar en Instagram es la única
acción del proyecto sin vuelta atrás.

Se usa `window.confirm` y no un diálogo propio a propósito: es lo que ya
estaba, no lleva estado ni componente nuevo, y en la app instalada se ve como
el diálogo del sistema — que es exactamente el peso que tiene que tener.

#### El panel se instala aparte, como una segunda app

Con la calculadora instalada en el teléfono no hay barra de direcciones donde
escribir `/admin`, y la app pública no lleva —ni debe llevar— ningún enlace al
panel. Desde la app instalada, sencillamente, no había forma de entrar.

La salida no fue abrir un hueco en la app pública sino declarar el panel como
**otra aplicación instalable**: `app/admin/layout.tsx` reemplaza el manifiesto
del layout raíz por `public/admin.webmanifest` para todo `/admin`. Se abre
`latasa.online/admin` en el navegador, se añade a la pantalla de inicio y
queda un segundo icono que entra directo al panel a pantalla completa.

- **El manifiesto cubre también `/admin/login`**, y eso no es un descuido: esa
  es justo la pantalla desde la que se instala. Si ahí se sirviera el
  manifiesto público, "Añadir a inicio" crearía otro acceso a la calculadora.
- **`scope: "/admin"`** mantiene las dos apps separadas: un enlace fuera del
  panel abre el navegador en vez de sacarte de contexto dentro de la app.
- **El icono va con la paleta invertida** (fondo acento, taza en el color del
  fondo, `INVERTIDO` en `scripts/generar-iconos.mjs`). Dos iconos idénticos en
  la pantalla de inicio no se distinguen de un vistazo, y a ese tamaño una
  palabra no se lee. Se regenera con `npm run iconos`, igual que los demás.
- **En iOS el nombre de la app instalada sale de `appleWebApp.title`**, no del
  manifiesto, así que se declara en el mismo layout.
- **El service worker no cachea nada de `/admin`** (`public/sw.js`, y por eso
  subió `VERSION`). Sus pantallas muestran estado del momento —cola,
  borradores, analíticas— y una copia vieja se leería como el estado de ahora;
  además, al cerrar sesión la copia guardada seguiría pintando el panel. Sin
  conexión no hay nada que hacer aquí: publicar necesita red de todos modos.
  Es la misma regla de `/api/` aplicada a las pantallas que solo tienen
  sentido en vivo.

#### El chrome de `/admin` vive en un layout, no repetido en cada página

Al principio cada página traía su propio `<header>` (logo, título, nav) y su
propia comprobación de sesión — siete copias del mismo
`if (!esSesionValida(...)) redirect(...)`, y una fila de píldoras que se
envolvía en el teléfono sin decir con claridad dónde estaba uno parado. Con
seis secciones ya se sentía un menú suelto, no un panel.

Ahora todas cuelgan de `app/admin/(dashboard)/layout.tsx` — un grupo de rutas
(las paréntesis no entran en la URL: `(dashboard)/hoy/page.tsx` sigue
resolviendo a `/admin/hoy`) que queda **fuera** de `/admin/login`, la única
página que no comparte sesión ni chrome con el resto. Ese layout hace la
comprobación de sesión una sola vez y envuelve todo en `AdminShell`
(`components/admin/AdminShell.tsx`): sidebar fija en escritorio y, en móvil,
**la misma sidebar servida como cajón** desde la hamburguesa del header.

Ahí hubo una tira de píldoras con scroll horizontal y se cambió: con nueve
secciones no cabía entera —había que arrastrarla para descubrir qué más
hay—, no dejaba ver los grupos y se comía una franja fija de pantalla en
todas las pantallas del panel, justo donde se llenan formularios largos. El
cajón enseña la lista completa y agrupada cuando se pide, y no ocupa nada
cuando no. La lista es **la misma en los dos sitios** (`Secciones`), no dos
copias que se desincronizan.

El cajón se queda montado y se mueve con `translate` para entrar y salir
deslizándose; `inert` mientras está cerrado lo saca del foco y de los
lectores de pantalla, para que su copia de la nav no se recorra dos veces
con el teclado. Cierra al tocar el fondo, con la X, con `Escape` y al pulsar
cualquier enlace — eso último lo hace cada enlace (`alNavegar`) y **no** un
efecto sobre el `pathname`: cerrar desde un efecto es `setState` dentro de
uno, el patrón que este proyecto evita y que el linter rechaza. Mientras
está abierto se bloquea el scroll del cuerpo, o arrastrar sobre el cajón
movería la página de detrás.

Es `"use client"` por `usePathname()` y por el estado del cajón; los enlaces
siguen siendo `<Link>` normales y el logout un `<form method="POST">` real,
así que navegar y cerrar sesión funcionan igual sin JavaScript.

Toda la nav —qué páginas hay, en qué orden, con qué ícono y bajo qué grupo
("Publicar", "Reportes y difusión", "Herramientas")— sale de una sola fuente,
`components/admin/nav-admin.ts`. La consumen tanto `AdminShell` (la nav de
verdad) como el dashboard de `/admin` (las tarjetas de acceso), así que un
enlace nuevo se agrega una vez y aparece en los dos sitios. Es también lo que
deja este chrome portable si el panel se separa algún día a un proyecto de
gestor de redes aparte: dos archivos, ninguna página conoce su posición en
la nav.

`/admin` abre con la **agenda del día** (`lib/agenda-hoy.ts`,
`components/admin/AgendaDelDia.tsx`): qué salió, qué está en camino y qué
necesita una persona. Va antes que las secciones porque responde la pregunta
con la que se abre el panel —"¿está todo bien?"— y las secciones responden la
siguiente: "¿dónde lo arreglo?"; por eso cada fila enlaza a donde se resuelve.

No mide nada nuevo: junta lo que ya estaba en la base. Los dos posts de tasas
salen de `historico_tasas` —`registrarSnapshot()` corre dentro de
`publicarTasasDelDia()` y solo con `momento` explícito, así que la presencia de
filas de un momento es el rastro más fiable de que ese disparo llegó a
publicar, y no un registro aparte que pudiera desincronizarse—, la espera sale
de `tasas_pendientes`, el borrador de `parada_pendiente` y lo programado de la
cola.

Dos criterios que la gobiernan:

- **El reloj decide si algo es un problema o todavía no.** A las 8 de la
  mañana que el post de las 9:00 no esté publicado es lo normal; a las 11 es un
  fallo. Sin esa distinción el panel estaría en ámbar media jornada y el ámbar
  dejaría de significar nada — `--warning` es semántico también aquí. El margen
  es de una hora: la publicación tarda (Meta procesa los contenedores) y, si
  faltaba una tasa base, el reintento va cada dos minutos.
- **Cada fuente se lee y falla por separado.** Un Supabase caído deja esa fila
  en "no se pudo consultar", no tumba la agenda ni el panel. Y lo que no tiene
  nada que decir no dice nada: sin programadas para hoy, esa fila no aparece —
  una línea que solo repite "no hay nada" es ruido en una lista de pendientes.

El **reporte semanal no está en la agenda** a propósito: nada en la base
registra cuándo se publicó el último, y la única fuente sería la Graph API —
una llamada por visita al panel para un dato que se mira una vez a la semana.

El dashboard de `/admin` no es una lista estática: cada tarjeta trae, cuando
hay algo real que atender, una insignia de estado —proveedores degradados en
"Publicar tasas", un borrador de La Parada sin publicar, publicaciones en
cola en "Noticias"— para que abrir el panel ya diga qué necesita revisión
antes de entrar a cada sección. Cada fuente de estado se envuelve en su
propio `try/catch`: un Supabase caído no puede tumbar el dashboard entero,
solo dejar sin insignia a la tarjeta que dependía de él.

`app/admin/(dashboard)/loading.tsx` es el esqueleto que Next.js muestra
mientras el `page.tsx` de destino resuelve su lectura a Supabase o a las
tasas en vivo. Al vivir en ese segmento cubre la navegación a **cualquier**
sub-ruta —`loading.tsx` envuelve tanto la página del propio segmento como
todas sus hijas—, así que un solo esqueleto basta y la sidebar no parpadea:
vive dentro del layout, por fuera del boundary de carga.

Los botones que ya avisaban con texto ("Publicando…", "Guardando…",
"Redactando…") llevan además un ícono girando al lado
(`components/admin/Spinner.tsx`, puramente decorativo, sin `role`) — se nota
de reojo sin leer el texto, útil cuando el botón queda arriba del scroll
mientras se revisa el resto del formulario. Y las vistas previas que genera
Satori al vuelo (La Parada, el reporte semanal, el post/carrusel de noticia)
usan `components/admin/ImagenConCarga.tsx`, que reserva el espacio final con
la proporción real (1:1 o 9:16) y muestra un esqueleto hasta que el
navegador termina de cargar la imagen — sin eso el `<img>` se veía en
blanco uno o dos segundos, y sin la proporción fija el esqueleto colapsaba a
0 de alto porque el navegador todavía no conoce el tamaño intrínseco de una
imagen que no ha terminado de descargar.

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
  contenido, y es el único sitio donde vive el pie de tres enlaces.** En
  Instagram los posts cierran con hashtags (o con "link en la bio", el diario y
  el semanal) porque allí los enlaces del caption no son clicables; en WhatsApp
  sí, y además aquí ya se conoce el permalink real —sale de la Graph API, del
  post que se está mirando—, así que el enlace va directo en vez de pasar por
  un atajo. `formatMensajeCanal` corta el cierre que traiga el caption
  publicado y pone el pie en su lugar. No hay IA de por medio, igual que los
  captions de origen.
- **Excepto el post diario de tasas, que sí tiene un atajo mejor: `/hoy`.**
  Es el mismo enlace que ya lleva el propio caption publicado, resuelve
  siempre al último post de tasas y trae su propia vista previa Open Graph —
  más corto y memorable que el permalink, y consistente con cómo la app
  enlaza al post del día en todos los demás sitios. `esCaptionDiario()`
  (`lib/caption.ts`) detecta el caption diario por su propio marcador
  ("📊 TASAS DE HOY", el mismo en mañana, tarde o el disparo manual sin
  momento) — nunca una noticia ni el semanal, que no empiezan así. Sin
  `SITE_URL` configurado se cae al permalink de siempre.
- **El texto se muestra editable, no de solo lectura**
  (`components/BotonCopiarTexto.tsx`). Es el mismo criterio que
  `captionOverride` en noticias: lo que arma la plantilla es un punto de
  partida, no algo intocable.
- **Un botón "Compartir" abre el selector nativo del sistema** cuando el
  navegador soporta `navigator.share` (Web Share API) — WhatsApp queda a un
  toque, sin el salto de copiar y cambiar de app a mano. Se oculta por
  completo si no está disponible (la mayoría de navegadores de escritorio),
  mismo criterio que el botón "Pegar" de la calculadora: un botón que nunca
  funciona es peor que no tenerlo. "Copiar mensaje" se queda como respaldo
  universal.

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
| `scripts/preview-brecha.ts` | La alerta de brecha: caption y las dos URLs (1:1 y 9:16) | Sí |
| `scripts/preview-ia.ts <tipo>` | Los dos textos que redacta la IA, junto a su plantilla | No |
| `scripts/video-tasas.ts` | El Reel de tasas del día, desde el snapshot publicado | No |

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

# Alerta de brecha: imprime el caption y las dos URLs (tampoco lleva firma)
npx tsx scripts/preview-brecha.ts
npx tsx scripts/preview-brecha.ts --sin-historico   # sin dato de hace una semana

# Textos de la IA: imprime también la plantilla, que es contra lo que se comparan
npx tsx scripts/preview-ia.ts noticia "https://url-del-articulo"
npx tsx scripts/preview-ia.ts semanal
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
| Alerta de brecha (1:1 y 9:16) | Satori, sin firma; las cifras salen de `lib/alerta-brecha.ts` | `app/api/og/instagram-brecha/route.tsx` |

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

- Los scripts leen `.env.local` y **se corren desde la raíz del repo**
  (`asegurarLogo()` lee `public/icon-512.png` relativo al directorio de trabajo).
- `preview-noticia.ts` necesita `CRON_SECRET`. `preview-marca.ts` necesita además
  las tres `CLOUDINARY_*`. `preview-semanal.ts` necesita `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY` para leer el histórico, salvo con
  `--sin-historico`, que no consulta nada. `preview-ia.ts` necesita
  `OPENROUTER_API_KEY`, y para `semanal` también las dos de Supabase.
- `npm run dev` hace falta **solo para las URLs de imagen**; las de video las
  sirve Cloudinary directamente.
- Cada corrida sin `--public-id` gasta almacenamiento del plan gratuito (25
  créditos al mes; 1 crédito = 1 GB de almacenamiento o de ancho de banda de
  video). Los archivos de prueba se borran a mano desde el panel de Cloudinary,
  y ahí también se acumulan los `cintillo_` de diseños viejos.
- Si una URL de imagen contesta **403**, el conjunto firmado y el enviado no
  coinciden: es lo que pasaba cuando los scripts firmaban sin `proporcion`
  después de que la ruta empezara a incluirla siempre.
- **Ninguno de los cuatro publica nada.** Solo publican de verdad
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