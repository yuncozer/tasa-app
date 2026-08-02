<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tasapp

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

### El aviso legal se queda

El pie declara que los datos son de terceros, que Tasapp no fija ni certifica
ninguna tasa y que nada de lo mostrado es asesoría financiera. No lo quites ni lo
suavices.

## Cómo trabajar en este proyecto

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

### El entorno de desarrollo

Este contenedor obliga a salir por `HTTPS_PROXY`, cosa que en producción no ocurre.
Afecta a dos sitios: el raspado del BCV necesita el túnel `CONNECT`, y Chromium hay
que lanzarlo con el proxy para alcanzar direcciones externas.

El service worker solo se registra en producción, así que para probarlo hace falta
`npm run build && npm start`, no `npm run dev`.

Chromium ya está instalado en `/opt/pw-browsers`; no ejecutes `playwright install`.

### Iconos

Los de la PWA se generan del propio logo con `npm run iconos`. Los PNG se
versionan, así que solo hay que regenerarlos si cambia el logo.
