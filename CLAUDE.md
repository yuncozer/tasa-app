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
- `formatCopRate()` (`lib/format.ts`) corre de escala el criterio de `formatRate`:
  la frontera entre "hace falta precisión" y "sobra" no está en 1 sino en 100,
  porque un peso vale mucho menos que un bolívar. Un dólar ronda los 3.100 COP y
  con 2 decimales sobra; un bolívar ronda los 4 COP y con 2 decimales se perdería
  la diferencia entre una jornada y otra.

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
  descripción corta del `<meta name="description">` en vez de romper.
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
`.env.local`.

### El entorno de desarrollo

Este contenedor obliga a salir por `HTTPS_PROXY`, cosa que en producción no ocurre.
Afecta a dos sitios: el raspado del BCV necesita el túnel `CONNECT`, y Chromium hay
que lanzarlo con el proxy para alcanzar direcciones externas.

Además, en algunas máquinas de desarrollo un antivirus con inspección TLS
(AVG, visible como `SSLKEYLOGFILE=...avgMonFltProxy...` en el entorno)
intercepta las peticiones HTTPS salientes con su propio certificado, que el
proceso de `next dev` no confía por defecto — la descarga de la imagen del
artículo en `app/api/og/instagram-post-news` falla con
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Es un problema puramente local (no ocurre
en producción ni con `curl`); si aparece, arranca así en su lugar:

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