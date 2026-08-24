# Video de tasas del día — plantilla

Reel vertical (1080×1920, 10 s) con las cuatro tasas del día y la brecha
BCV/Binance de remate. Se genera cuando haga falta —los domingos o cualquier
día— con los datos de la publicación de esa jornada.

## Generarlo

Desde la **raíz del repo**, no desde esta carpeta:

```bash
npx tsx scripts/video-tasas.ts --render
```

Eso lee el snapshot ya publicado, escribe `variables.json` y renderiza
`renders/video.mp4`. Sin `--render` solo escribe las variables y enseña las
cifras por consola, que sirve para revisarlas antes de gastar el minuto de
render.

| Flag | Para qué |
| --- | --- |
| *(ninguno)* | Escribe `variables.json` con los datos del último post y los imprime |
| `--render` | Además renderiza el MP4 |
| `--en-vivo` | Usa las tasas del momento en vez de las publicadas (**solo para probar el diseño**) |

## De dónde salen las cifras

**De `snapshot_hoy`, no de `getRates()`.** Esa tabla guarda el snapshot exacto
con el que el cron armó el caption justo antes de publicar. El video se comparte
junto a ese post, así que tiene que decir lo mismo: leyendo las tasas en vivo, un
Binance que se moviera entre medias dejaría el video afirmando una cifra distinta
de la que la gente ya tiene en el feed. Es el mismo motivo por el que
`/api/og/instagram-post` dejó de leer las tasas en vivo.

**Ninguna cifra se calcula en el script.** La brecha sale de `calcularBrecha()`
(`lib/brecha.ts`) y la fila en pesos de `buildFilasPesos()` (`lib/pesos.ts`),
que son las que ya usan la portada, el reporte semanal y el post diario. Las
etiquetas y las fuentes se leen del snapshot, no se escriben a mano, así que si
cambia una en la app cambia también aquí.

**La fila en pesos nombra la venta.** Promediar compra y venta está prohibido en
este proyecto —esconde la diferencia real entre lo que se paga y lo que se
recibe—, y una cifra suelta tiene que nombrar un lado del mercado, igual que la
brecha.

**Si falta una tasa, el script se niega a generar el video.** No hay degradación
a `Sin dato` como en la portada: aquello muestra un estado y esto produce un
archivo que se sube a Instagram y no se corrige después.

**La fecha y la hora salen del snapshot**, no del reloj de la máquina: lo que
fecha la pieza es el instante en que se capturaron las tasas, que es el que el
lector puede contrastar con el post. Por eso un video generado el lunes por la
mañana sobre el post del domingo dice la hora del domingo, que es lo correcto.

## Qué se versiona y qué no

Al repositorio sube solo lo que hace falta para **reconstruir** el video en otra
máquina o en la nube: la plantilla (`index.html`, con la fuente embebida), los
efectos de sonido de `.media/` y el `.woff2`. Son 652 KB una sola vez, y no
crecen aunque se generen mil videos.

Todo lo **generado** queda fuera —`renders/`, `snapshots/`, `variables.json`, y
la caché del Studio— por `videos/.gitignore`. Ese archivo vive un nivel por
encima y sin rutas ancladas a propósito: así cubre también cualquier proyecto de
video que se cree después, sin tener que acordarse de nada. No añadas un MP4 al
repositorio por comodidad: cada uno pesa cerca de 1 MB y se rehace con un
comando.

## Tocar el diseño

`index.html` es la plantilla. Los números que trae escritos son **solo el
respaldo**: sirven para que el archivo abierto suelto —o en Studio— muestre algo
coherente, y los pisa `variables.json` en cada render. Al cambiar el diseño,
comprobar con:

```bash
npx hyperframes check .
npx hyperframes snapshot --at 1.3,3.6,4.8,6,9
```

Dos cosas que muerden:

- **El Studio reescribe este archivo.** Le añade atributos `data-hf-id` y, lo
  importante, convierte las comillas del `data-composition-variables` en
  `&quot;`. El navegador lo entiende, pero `lint` lee el archivo en crudo y lo
  rechaza como JSON inválido. Si aparece `invalid_composition_variables_declaration`,
  la causa es esa: hay que devolver el atributo a comillas simples con el Studio
  cerrado.
- **La duración se fija al compilar.** `data-duration` del root no se puede
  variabilizar; para cambiar la longitud se edita el atributo a mano.

## El sonido

Nueve efectos del catálogo de `media-use`, en `.media/audio/sfx/`, cada uno en
el fotograma exacto de su causa. Van mezclados bajos a propósito —pico −6,4 dB,
media −19,2 dB— para dejar unos 6 dB de cabecera a la voz que se añade después
en CapCut. El mapa completo y la dirección de voz están en `GUION.md`.

Si se cambian los niveles, medir el resultado en vez de confiar en el oído:

```bash
ffmpeg -i renders/video.mp4 -af volumedetect -f null -
```

## La voz

No se genera aquí. El TTS local (Kokoro) solo tiene una voz en español y está
documentada como peninsular, sin control de emoción — mal encaje para un público
de la frontera colombo-venezolana. El guion de `GUION.md` se pega en CapCut, que
sí tiene voces latinas.
