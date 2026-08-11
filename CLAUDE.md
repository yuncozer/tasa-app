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
- `MAX_TITULO` recorta por caracteres y no con `line-clamp`, que Satori no
  implementa: sin tope, un titular largo empuja la caja y se sale del lienzo.
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

### Probar el post de noticias en local

Para ver la imagen y el caption de una noticia **sin publicar de verdad**,
con `npm run dev` corriendo en otra terminal:

```bash
npx tsx scripts/preview-noticia.ts "https://url-del-articulo"
```

Hace `fetchArticle()` sobre esa URL real, arma el caption con
`buildNewsCaption` y firma los parámetros de la imagen — imprime el caption
completo y una URL local ya firmada de `/api/og/instagram-post-news` para
pegar en el navegador y ver la imagen generada. Lee `CRON_SECRET` de
`.env.local` para firmar (no publica nada; solo `POST /api/publish-instagram-news`
o el botón "Publicar" de `/admin/noticia` publican de verdad).

Para probar `/admin/noticia` en sí hace falta además `ADMIN_PASSWORD` en
`.env.local`, y las tres `CLOUDINARY_*` para todo lo que suba imágenes o
video.

### Probar las marcas sin publicar ni pasar por `/admin`

`preview-noticia.ts` cubre solo una de las cuatro piezas que la app marca: la
imagen principal de un artículo scrapeado. Para las otras tres —y para probar
con material propio en vez de con un artículo— está
`scripts/preview-marca.ts`, que sube el archivo y devuelve las URLs de todas
las variantes que le correspondan:

```bash
npx tsx scripts/preview-marca.ts foto.jpg   # principal (con titular) y secundaria de carrusel
npx tsx scripts/preview-marca.ts clip.mp4   # carrusel 1:1, 4:5 y Reel 9:16, cada uno con su fotograma
npx tsx scripts/preview-marca.ts --public-id <id> --tipo video   # reusa lo ya subido
```

| Pieza | Quién la compone | Dónde se edita |
| --- | --- | --- |
| Imagen principal de post | Satori, con titular y fecha | `app/api/og/instagram-post-news/route.tsx`, `lib/og-shared.ts` |
| Imagen secundaria de carrusel | Satori, sin titular (`ALTO_FOTO.secundaria`) | los mismos |
| Video en carrusel (1:1 y 4:5) | Cloudinary, transformación por URL | `lib/providers/cloudinary.ts` |
| Video como Reel (9:16) | Cloudinary, misma cadena, otro lienzo | el mismo |
| Cintillo del video | Satori, PNG transparente sobre la capa | `lib/og-cintillo.tsx` |

Al iterar, las dos mitades se comportan distinto y conviene saberlo:

- **Imagen**: la firma cubre los parámetros, no el HTML. Editas la plantilla,
  recargas el navegador con `npm run dev` levantado y ya — no hace falta
  volver a correr el script. Solo hay que regenerar la URL si cambia el
  artículo o si se añade o quita el título, porque la firma cubre exactamente
  el conjunto de claves presentes.
- **Video**: la transformación viaja en la URL, así que hay que volver a
  correr el script (con `--public-id`, que no vuelve a subir el original) tras
  cada cambio. Como la URL nueva es otra, tampoco hay caché vieja que
  invalidar.

Del video se revisa el **fotograma**, no el clip: `urlFotogramaConMarca()` pide
un JPG sobre la misma transformación que `urlVideoConMarca()` —comparten
`transformacionMarca()` justamente para que lo revisado sea lo publicado—, y
mirarlo es inmediato y deja algo que comparar después. Reproducir el `<video>`
para ver si el overlay quedó bien es mucho más lento.

El script necesita las tres `CLOUDINARY_*` y `CRON_SECRET` en `.env.local`, y
correrse desde la raíz del repo (`asegurarLogo()` lee `public/icon-512.png`
relativo al directorio de trabajo). `npm run dev` hace falta solo para las URLs
de imagen; las de video las sirve Cloudinary. Ten en cuenta que cada corrida
sin `--public-id` gasta almacenamiento del plan gratuito (25 créditos al mes;
1 crédito = 1 GB de almacenamiento o de ancho de banda de video), y que los
archivos de prueba se borran a mano desde el panel de Cloudinary.

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