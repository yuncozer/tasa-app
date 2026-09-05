# La Tasa

Tasas del día y calculadora de conversiones cruzadas para la frontera colombo-venezolana.

En la frontera se comercia con cuatro referencias a la vez y la pregunta habitual no es
"¿cuántos bolívares son 100 $?" sino **"si cambio 100 $ a tasa BCV, ¿cuántos dólares
Binance, euros o pesos me quedan?"**. La Tasa responde eso: muestra las tasas del día y
convierte cualquier monto usando el bolívar como pivote.

Hecho con Next.js 16 (App Router), TypeScript y Tailwind CSS v4. Sin base de datos y sin
dependencias fuera del framework.

## Poner en marcha

```bash
npm install
npm run dev     # http://localhost:3000
```

No hace falta ninguna clave de API. Hay dos variables de entorno opcionales, ver
[Variables de entorno](#variables-de-entorno).

## Cómo calcula

Cada moneda tiene un precio en bolívares (`bsPerUnit`). Convertir es pasar por el bolívar:

```
bs             = monto × tasa(origen)
monto_destino  = bs ÷ tasa(destino)
```

Ejemplo con las tasas del 2 de agosto de 2026:

| Paso | Cálculo | Resultado |
| --- | --- | --- |
| 100 $ a tasa BCV | 100 × 748,7864 | 74.878,64 Bs |
| esos Bs en dólares Binance (venta) | 74.878,64 ÷ 846,38 | 88,47 $ |
| esos Bs en euros BCV | 74.878,64 ÷ 861,1867 | 86,95 € |
| esos Bs en pesos oficiales | 74.878,64 ÷ 0,2382 | 314.414 COP |
| esos Bs en pesos de frontera | 74.878,64 ÷ 0,2683 | 279.039 COP |

### Los dos precios del peso

El peso no cotiza contra el bolívar: su precio en Bs sale de cruzar dos dólares, y según
cuáles se usen salen dos números que en la frontera conviven:

```
Peso oficial   = dólar BCV        ÷ TRM                 = 748,79 ÷ 3.144,14 = 0,2382 Bs
Peso frontera  = dólar Binance VES ÷ dólar Binance COP  = 846,38 ÷ 3.154,08 = 0,2683 Bs
```

El **oficial** cruza las dos tasas de papel: la del BCV y la TRM del Banco de la República.
El de **frontera** cruza los dos mercados P2P, que es lo que de verdad se paga: hoy un 12,6 %
por encima. No existe API pública de las casas de cambio de Cúcuta, así que ese cruce de
mercado es la mejor aproximación verificable.

## API REST

**Las rutas de datos necesitan clave.** Se manda en la cabecera
`x-api-key: <clave>`, y las válidas viven en `API_KEYS` separadas por comas.
Sin ella responden `401` diciendo cómo pedir una. `/api/health` y
`/api/eventos` siguen abiertas: la primera es un diagnóstico que no publica
ninguna tasa, y la segunda la llama el navegador de cada visitante.

| Método | Ruta | Clave | Devuelve |
| --- | --- | --- | --- |
| `GET` | `/api/rates` | sí | Todas las tasas. `?refresh=1` pide una lectura nueva si la guardada ya tiene 20 s |
| `GET` | `/api/rates/bcv` | sí | Dólar y euro oficiales |
| `GET` | `/api/rates/binance` | sí | Mercado P2P en VES y en COP, con compra, venta y punto medio, para una operación de referencia |
| `GET` | `/api/rates/cop` | sí | TRM, precio P2P del peso y sus dos valores en Bs |
| `POST` | `/api/convert` | sí | Equivalencias de un monto |
| `GET` | `/api/health` | no | Estado de cada proveedor (`200` sano, `207` degradado). Dice si responde y su degradación, nunca el error interno |

```bash
curl -X POST localhost:3000/api/convert \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"from":"USD_BCV"}'
```

Bases válidas en `from`: `USD_BCV`, `USD_BINANCE_BUY`, `USD_BINANCE_SELL`, `EUR_BCV`,
`COP_OFICIAL`, `COP_FRONTERA`, `VES`. Los errores siempre responden
`{ "error": "...", "detail": "..." }`.

## Fuentes de datos

| Dato | Fuente | Notas |
| --- | --- | --- |
| Dólar y euro BCV | `https://www.bcv.org.ve/` | Se lee el HTML de la portada. Su certificado TLS está vencido, así que la petición usa `node:https` sin validarlo, acotado a ese host |
| Dólar BCV (respaldo) | `https://ve.dolarapi.com/v1/dolares/oficial` | Solo publica el dólar; cuando entra en juego, el euro queda sin dato |
| Mercado P2P (VES y COP) | `POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search` | Endpoint público de la web de Binance. Se consulta con `fiat: VES` y `fiat: COP`. La tasa final es la mediana recortada de los anuncios que cubren una operación de referencia de $100 (en VES, además vía Pago Móvil; configurable, ver abajo); si ese filtro no trae anuncios, cae al valor sin filtrar |
| TRM oficial | `https://www.datos.gov.co/resource/32sa-8pi3.json` | Datos abiertos de Colombia, sin clave. Es la TRM certificada por la Superintendencia Financiera |
| TRM (respaldo) | `https://open.er-api.com/v6/latest/USD` | Cotización internacional del peso. No es la TRM, así que cuando entra en juego la tarjeta lo indica y `/api/health` lo explica |

Si el entorno define `HTTPS_PROXY`, la petición al BCV abre el túnel `CONNECT` a mano:
Node no aplica esa variable por su cuenta.

### Sobre las APIs del documento de referencia

El documento de partida proponía otros endpoints que, al verificarlos, ya no servían:

- `bcv.today/en/api/*` → 404, el dominio no expone esa API.
- `bcvapi.tech/api/v1/dolar` → 401, ahora exige registro.
- `v6.exchangerate-api.com` → 403, exige clave; se usa el plan abierto `open.er-api.com`.
- `api.frankfurter.dev` → 404, y Frankfurter solo cubre monedas del BCE (sin COP ni VES).
- `api.exchangerate.host` → exige `access_key`.
- Binance vía SDK → innecesario, el endpoint REST público basta.

## Variables de entorno

Las dos primeras son opcionales; sin definirlas, la app usa $100 vía Pago Móvil como
operación de referencia para la tasa Binance P2P en VES (en COP se filtra solo por
monto). Las cuatro últimas solo hacen falta para el post diario en Instagram (ver
[Publicación automática en Instagram](#publicación-automática-en-instagram)); sin
ellas, el resto de la app funciona igual. Ver `.env.example`.

| Variable | Default | Qué controla |
| --- | --- | --- |
| `BINANCE_REFERENCE_USD_AMOUNT` | `100` | Monto (en USD) de la operación de referencia usada para filtrar anuncios por `transAmount`, en VES y en COP |
| `BINANCE_REFERENCE_PAY_TYPE` | `PagoMovil` | Identificador de Binance para el método de pago usado en el filtro `payTypes`, solo en VES |
| `CRON_SECRET` | — | Autentica las llamadas de cron-job.org a `/api/cron/*` |
| `SITE_URL` | — | Dominio público de producción; Instagram lo usa para buscar la imagen del post |
| `IG_BUSINESS_ACCOUNT_ID` | — | ID de la cuenta de Instagram Business que publica |
| `IG_ACCESS_TOKEN` | — | Token de acceso de larga duración con permiso `instagram_content_publish` |
| `SUPABASE_URL` | — | Proyecto de Supabase donde vive la cola de publicaciones programadas |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Clave `service_role` del mismo proyecto. Salta el RLS: solo servidor, nunca `NEXT_PUBLIC_` |
| `ENLACE_HOY` | — | Respaldo de `/hoy` si el cron todavía no anotó el post del día (ver [Atajos del dominio](#atajos-del-dominio)) |
| `PERFIL_INSTAGRAM_URL` | `instagram.com/latasa.online` | Destino de `/ig` |
| `ENLACE_WHATSAPP` | — | Destino de `/wa`. Sin ella la ruta no existe |
| `ADMIN_PASSWORD` | — | Contraseña de `/admin`. Secreto aparte de `CRON_SECRET` |
| `API_KEYS` | — | Claves de la API de datos, separadas por comas. Sin ella nadie entra a `/api/rates` ni a `/api/convert` |
| `SESSION_VERSION` | `1` | Subirla invalida de golpe todas las sesiones abiertas de `/admin`, sin cambiar la contraseña |
| `FIRMA_IMAGENES_SECRET` | `CRON_SECRET` | Secreto con el que se firman los parámetros de `instagram-post-news`. Separado a propósito: rotar la firma no debería obligar a rotar el acceso a publicar |
| `OPENROUTER_API_KEY` | — | Clave de OpenRouter. Sin ella no aparecen los botones de "Redactar con IA" (ver [Textos con IA](#textos-con-ia)) |
| `OPENROUTER_MODELOS` | lista de `lib/ia.ts` | Modelos a probar, en orden, separados por comas |
| `RESEND_API_KEY` | — | Clave de Resend para los avisos por correo. Sin ella no se manda ninguno y todo lo demás sigue igual |
| `RESEND_FROM` | `La Tasa <onboarding@resend.dev>` | Remitente de esos correos |
| `NOTIFICAR_EMAIL` | — | A dónde llegan los avisos (borrador de La Parada, post que no salió, programada fallida, token que no se pudo renovar). Se sigue aceptando el nombre anterior `NOTIFICAR_PARADA_EMAIL` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | — | Clave pública VAPID de los avisos push. Viaja al navegador a propósito |
| `VAPID_PRIVATE_KEY` | — | Su pareja privada. Sin las dos no se manda ningún aviso y el post sale igual |

## Caché y actualización

Hay tres cachés, cada una resolviendo algo distinto:

| Dónde | Alcance | Para qué |
| --- | --- | --- |
| Memoria de la función (`lib/cache.ts`) | Una instancia, 5 min | Que dos visitas seguidas no consulten dos veces |
| CDN (`Cache-Control` con `s-maxage`) | Todos los usuarios, 1 min | Que el tráfico no llegue a las fuentes |
| Service worker (`public/sw.js`) | Un dispositivo | Que la app abra sin conexión |

La de la CDN es la que acota el trato a las fuentes: Vercel levanta una instancia
nueva por cada pico de tráfico y cada una nace con la caché en memoria vacía, así
que sin ella el número de consultas al BCV crecería con las visitas. Con
`s-maxage=60` reciben como mucho una por minuto, entren dos personas o dos mil, y
`stale-while-revalidate=300` hace que al vencer el minuto se sirva la copia
anterior al instante mientras se refresca por detrás.

El navegador no guarda copia propia (`max-age=0`): así una corrección nuestra nunca
queda pegada en el teléfono de nadie. Y lo que pide datos frescos a propósito
—`/api/rates?refresh=1`, `/api/health` y los errores— responde `no-store`.


`lib/cache.ts` guarda la fotografía de tasas 5 minutos en memoria, deduplica peticiones
simultáneas y, si un proveedor falla, conserva el último valor bueno en lugar de dejar la
tarjeta vacía. El botón "Actualizar tasas" navega con `?actualizar=<marca>` para forzar una
consulta nueva.

Ese parámetro lo puede escribir cualquiera, así que quien decide si de verdad se vuelve a
preguntar es `pedirTasasFrescas()`: olvida **solo** la clave de las tasas —nunca el Map
entero, donde también viven el token de Instagram y la tarjeta de La Parada— y solo si el
valor guardado ya tiene 20 segundos. Sin ese freno, un bucle desde fuera forzaba una ronda
al BCV, a Binance y a datos.gov.co por petición, con el riesgo de que la fuente bloquee la
IP.

Los proveedores se consultan con `Promise.allSettled`: que Binance esté caído no impide ver
la tasa del BCV. Lo que falte se marca en la interfaz como "dato no disponible" y queda
explicado en `/api/health`, que publica el nombre del proveedor y su aviso pero no el texto
del error: ese va a los logs del servidor y al panel, no a una ruta pública.

## Publicación automática en Instagram

Cada día a las 9:00 am y a las 6:00 pm hora de Caracas se dispara
`GET /api/cron/publish-instagram` (protegido con `CRON_SECRET`), que arma los posts
con las tasas del momento y los publica en `@latasa.online` vía la Graph API de Meta.
Los dos horarios son dos tareas separadas, cada una con `?momento=manana` o
`?momento=tarde` en la ruta — ese query param es lo único que decide el título del
caption ("Tasas de hoy por la mañana/tarde").

Quien dispara es **cron-job.org**, no Vercel Cron. En el plan Hobby los crons se
ejecutan "dentro de la hora" y no a la hora exacta, así que el post de las 9:00 podía
salir a las 9:50; y además solo admiten un disparo diario, lo que no sirve para la
cola de publicaciones programadas. Todos los disparos viven ahí, con el header
`Authorization: Bearer <CRON_SECRET>`:

| Tarea | Cuándo (UTC) | Para qué |
| --- | --- | --- |
| `/api/cron/publish-instagram?momento=manana` | `0 13 * * *` | El disparo de las 9:00 am de Caracas |
| `/api/cron/publish-instagram?momento=tarde` | `0 22 * * *` | El disparo de las 6:00 pm de Caracas |
| `/api/cron/publicar-programadas` | cada 2 min | Avanza la cola de publicaciones programadas, una fase por disparo |
| `/api/cron/publicar-tasas-pendientes` | cada 2 min | Reintenta el post del día cuando faltaba una tasa base |
| `/api/cron/vigilar-parada` | cada 10 min | Detecta la columna diaria de "Dólar en La Parada" |
| `/api/cron/refrescar-token-ig` | `0 10 * * *` | Renueva el token de Instagram antes de que caduque |
| `/api/cron/resumen-dia` | `0 1 * * *` | Manda por correo el resumen del día (9:00 pm de Caracas) |

Los dos disparos de tasas pueden quedar activados **todos los días**: qué
publica cada uno lo decide el propio código (`modoPorDefecto()` en
`lib/ajustes-publicacion.ts`), que de lunes a viernes saca el carrusel con
Historias por la mañana y solo el carrusel por la tarde, y los fines de semana
nada por la mañana y carrusel con Historias por la tarde. Desde `/admin/hoy`
se puede cambiar cualquiera de los dos **solo por hoy**.

Al configurarlas, **desactivar los reintentos automáticos**. El post diario no es
idempotente: si una ejecución se pasa del tope de tiempo pero Meta ya publicó, un
reintento duplicaría el post. El reintento vive dentro de cada cola, que sí sabe por
dónde iba. Y en el refresco del token un reintento inmediato falla siempre, porque
Meta exige que el token tenga al menos 24 horas.

Cada disparo publica **un carrusel de dos diapositivas**: las tasas en bolívares y
las mismas tasas en pesos colombianos. Son un solo post y no dos porque cuatro
publicaciones casi idénticas al día saturan el feed y la cuadrícula del perfil, y
porque el post en pesos es el complemento del de bolívares, no una noticia aparte.
De paso desaparece el estado a medias: un carrusel sale entero o no sale, mientras
que dos publicaciones seguidas pueden dejar la primera publicada y la segunda no.
Ambas diapositivas salen del mismo `getRates()`, así que no pueden mostrar cifras
distintas.

- `app/api/og/instagram-post/route.tsx` genera la primera diapositiva con `next/og`
  (1080×1080, sin capturas ni assets estáticos con parches: se renderiza de nuevo
  cada vez con los montos del momento). Es una ruta pública sin autenticación porque
  Instagram necesita poder buscarla como cualquier imagen.
- `app/api/og/instagram-post-pesos/route.tsx` genera la segunda con las tasas en
  pesos: misma plantilla, mismas piezas de `lib/og-shared.tsx`, otra moneda al lado
  del número.
- `lib/pesos.ts` calcula las filas de esa segunda diapositiva (dólar TRM, dólar
  frontera de compra y de venta, bolívar promedio) con `convert()`, la misma función
  pura de la calculadora, y las comparten imagen y caption para que no puedan
  divergir.
- `lib/caption.ts` arma el texto con una plantilla fija, sin ningún API de IA de por
  medio. El caption es uno solo —el del contenedor padre— y lleva los **dos** bloques
  de cifras: la segunda diapositiva solo se ve si el lector desliza, así que los
  números en pesos tienen que estar también ahí.
- `publishCarouselPost` en `lib/instagram.ts` crea un contenedor hijo por imagen
  (`is_carousel_item`), un padre que los agrupa (`media_type=CAROUSEL`) con el
  caption, y publica el padre. Los hijos se crean en paralelo porque es al crearlos
  cuando Meta se descarga cada imagen, y las nuestras se renderizan al vuelo. El
  route exporta `maxDuration = 60` por eso mismo: son cuatro viajes a Meta más los
  reintentos del código 9007.
- `lib/instagram.ts` habla con **"Instagram API with Instagram Login"** (login
  directo por instagram.com, sin pasar por una Página de Facebook): crea el
  contenedor de media y lo publica, con reintentos cortos si Meta todavía lo
  está procesando. Ojo con esto si algún día se cambia de flujo: esta variante
  usa `graph.instagram.com` y tokens que empiezan con `IGAA`; el otro flujo
  posible (login por Página de Facebook) usa `graph.facebook.com` y tokens
  `EAA` — son bases distintas y un token de un flujo no sirve en el otro
  ("Cannot parse access token" si se mezclan).

### Cómo obtener las credenciales de Meta

1. Convierte la cuenta de Instagram a **Business o Creator** (Configuración → Tipo
   de cuenta y herramientas).
2. Crea una **app de Meta** en developers.facebook.com/apps, tipo "Business", y
   agrégale el producto **Instagram** → **"API setup with Instagram login"**.
3. Ahí mismo, en **Roles → Instagram testers**, agrega la cuenta de Instagram que
   va a publicar. Acepta la invitación desde la cuenta misma, en
   `instagram.com/accounts/manage_access/` — sin esto la vinculación falla con
   "Rol de desarrollador insuficiente".
4. En `business.facebook.com` → Configuración del negocio, conviene tener la
   cuenta de Instagram y la app dentro del mismo Business Manager (Cuentas →
   Cuentas de Instagram / Apps → Agregar); ayuda a que Meta reconozca la
   relación entre ambas.
5. Autoriza la app con los scopes `instagram_business_basic` e
   `instagram_business_content_publish` (flujo OAuth de "API setup with
   Instagram login" en el propio dashboard, o un link de autorización manual)
   — de ahí sale un token de usuario de Instagram (empieza con `IGAA`).
6. Cámbialo por uno de **larga duración** (60 días) vía
   `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<app-secret>&access_token=<token-corto>`.
   Ese es el valor de `IG_ACCESS_TOKEN`.
7. `IG_BUSINESS_ACCOUNT_ID` es el ID de la cuenta de Instagram para ese token:
   confírmalo con `GET https://graph.instagram.com/me?fields=id,username&access_token=<IG_ACCESS_TOKEN>`
   (el `id` que devuelve tiene que ser ese, no un ID sacado de una Página de
   Facebook — pueden no coincidir entre los dos flujos).
8. Carga `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`, `CRON_SECRET` y `SITE_URL` en
   las variables de entorno de Vercel (producción) y en `.env.local` para probar
   en local.

## Atajos del dominio

Tres rutas cortas para compartir, pensadas para pegarse en un chat:

| Ruta | A dónde lleva |
| --- | --- |
| `/hoy` | El carrusel de tasas más reciente publicado en Instagram |
| `/ig` | El perfil `@latasa.online` |
| `/wa` | El WhatsApp de La Tasa (solo si `ENLACE_WHATSAPP` está configurada) |

`/ig` y `/wa` son redirecciones 307 declaradas en `next.config.ts`. `/hoy` no puede
serlo por dos motivos:

- **Su destino cambia dos veces al día.** `redirects()` se evalúa al compilar, y en
  Vercel un cambio de variable de entorno solo entra con un despliegue nuevo. En vez
  de eso, el cron que publica el carrusel consulta el permalink del post
  (`GET /{mediaId}?fields=permalink`) y lo anota en la tabla `enlaces` de Supabase;
  `app/hoy/page.tsx` lo lee en cada visita. Si no hay nada anotado cae a `ENLACE_HOY`,
  y si tampoco, al perfil.
- **Una redirección se queda sin vista previa en WhatsApp.** El rastreador la sigue
  hasta Instagram y ahí se encuentra el muro de login, sin `og:image` ni `og:title`.
  Por eso `/hoy` es una página que declara sus propias etiquetas Open Graph —con la
  imagen del post del día, la que genera `/api/og/instagram-post`— y manda al
  visitante real a Instagram con un `<meta http-equiv="refresh">`. El rastreador no
  ejecuta esa redirección, así que se queda con la tarjeta.

Anotar el enlace va dentro de un `try/catch` que se ignora: el post ya salió y es lo
irreversible, así que un fallo ahí no puede convertir una publicación exitosa en un
error que invite a reintentar y duplique el post.

## PWA

La Tasa se instala en la pantalla de inicio y abre a pantalla completa. El manifiesto lo
genera `app/manifest.ts` y los iconos salen del propio logo con `npm run iconos`
(`scripts/generar-iconos.mjs`), que rasteriza el SVG con sharp; los PNG se versionan, así
que solo hay que regenerarlos si cambia el logo.

El service worker (`public/sw.js`) está escrito a mano —la alternativa que sugiere Next,
Serwist, exige configuración de webpack y aquí se usa Turbopack— y se registra solo en
producción:

| Petición | Estrategia | Por qué |
| --- | --- | --- |
| Navegación a `/` | Red primero, con copia de respaldo | Sin señal la app abre igual, con las últimas tasas vistas |
| `/_next/static/`, iconos | Caché primero, revalidando detrás | Son inmutables |
| `/api/**` | **Nunca se cachea** | Una tasa vieja servida como fresca es justo el daño que hay que evitar |

Cuando no hay conexión aparece una franja arriba —"Sin conexión · tasas de hace 3 horas"—
porque enseñar tasas viejas sin decirlo es lo único de esta app capaz de causar un
perjuicio real.

Las notificaciones push quedan fuera por ahora: exigen claves VAPID, guardar las
suscripciones y un proceso que vigile las tasas.

## Textos con IA

Dos textos de `/admin` se pueden redactar con un modelo de lenguaje, a través de
[OpenRouter](https://openrouter.ai) y con su plan gratuito:

- **El caption de un post de noticia**, en `/admin/noticia`.
- **El análisis del reporte semanal**, en `/admin/semanal`: un párrafo de
  contexto que se publica debajo de las cifras.

Cuatro límites que definen lo que la IA hace aquí, y que no son negociables:

1. **Nunca produce ni toca una cifra.** Los números salen de `convert()`,
   `lib/pesos.ts` y `lib/semanal.ts`; el modelo solo escribe la prosa que los
   acompaña.
2. **Nunca publica sola.** Se dispara al pulsar un botón y el texto cae en un
   campo editable, que hay que revisar antes de darle publicar. Los crons —el
   post diario de tasas y la cola de programadas— siguen siendo 100 % plantilla.
3. **Si falla, no pasa nada.** `lib/ia.ts` nunca lanza: devuelve `null` ante una
   clave ausente, un 429 por cuota agotada, un timeout o una respuesta vacía, y
   entonces vale el texto de plantilla de siempre. La interfaz lo dice.
4. **Ninguna visita gasta cuota.** La portada y la calculadora no llaman a la IA
   en absoluto; solo lo hacen dos botones detrás de la sesión de `/admin`.

Para iterar los prompts sin pasar por el navegador:

```bash
npx tsx scripts/preview-ia.ts noticia "https://url-del-articulo"
npx tsx scripts/preview-ia.ts semanal
```

Imprime también el texto de plantilla, que es contra lo que hay que compararlo.

## Estructura

```
app/            páginas, rutas API y manifiesto (App Router, sin carpeta src/)
components/     panel de tasas, calculadora, teclado numérico y piezas de la PWA
lib/            proveedores, agregación, conversión, formato e Instagram
public/         service worker e iconos generados
scripts/        generación de iconos y vistas previas (marca, semanal, IA)
```
