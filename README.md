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

| Método | Ruta | Devuelve |
| --- | --- | --- |
| `GET` | `/api/rates` | Todas las tasas. `?refresh=1` salta la caché |
| `GET` | `/api/rates/bcv` | Dólar y euro oficiales |
| `GET` | `/api/rates/binance` | Mercado P2P en VES y en COP, con compra, venta y punto medio, para una operación de referencia |
| `GET` | `/api/rates/cop` | TRM, precio P2P del peso y sus dos valores en Bs |
| `POST` | `/api/convert` | Equivalencias de un monto |
| `GET` | `/api/health` | Estado de cada proveedor (`200` sano, `207` degradado) |

```bash
curl -X POST localhost:3000/api/convert \
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
| `CRON_SECRET` | — | Autentica la llamada de Vercel Cron a `/api/cron/publish-instagram` |
| `SITE_URL` | — | Dominio público de producción; Instagram lo usa para buscar la imagen del post |
| `IG_BUSINESS_ACCOUNT_ID` | — | ID de la cuenta de Instagram Business que publica |
| `IG_ACCESS_TOKEN` | — | Token de acceso de larga duración con permiso `instagram_content_publish` |

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

Los proveedores se consultan con `Promise.allSettled`: que Binance esté caído no impide ver
la tasa del BCV. Lo que falte se marca en la interfaz como "dato no disponible" y queda
explicado en `/api/health`.

## Publicación automática en Instagram

Cada día a las 9:00 am y a las 6:00 pm hora de Caracas, Vercel Cron dispara
`GET /api/cron/publish-instagram` (protegido con `CRON_SECRET`), que arma el post
con las tasas del momento y lo publica en `@latasa.online` vía la Graph API de Meta.
Los dos horarios son dos entradas separadas en `vercel.json`, cada una con
`?momento=manana` o `?momento=tarde` en la ruta — ese query param es lo único que
decide el título del caption ("Tasas de hoy por la mañana/tarde"); no se puede sacar
de una variable de entorno porque Vercel lee `vercel.json` en tiempo de deploy, no de
ejecución. Para cambiar los horarios hay que editar `vercel.json` directamente
(recordar que sus `schedule` van siempre en UTC) y volver a desplegar.

- `app/api/og/instagram-post/route.tsx` genera la imagen del post con `next/og`
  (1080×1080, sin capturas ni assets estáticos con parches: se renderiza de nuevo
  cada vez con los montos del momento). Es una ruta pública sin autenticación
  porque Instagram necesita poder buscarla como cualquier imagen.
- `lib/caption.ts` arma el texto del post con una plantilla fija, sin ningún API de
  IA de por medio.
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

## Estructura

```
app/            páginas, rutas API y manifiesto (App Router, sin carpeta src/)
components/     panel de tasas, calculadora, teclado numérico y piezas de la PWA
lib/            proveedores, agregación, conversión, formato e Instagram
public/         service worker e iconos generados
scripts/        generación de iconos a partir del logo
```
