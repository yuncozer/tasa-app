# Guion de voz y mapa sonoro

Video: `renders/video.mp4` — 9:16, 1080×1920, **10,0 s**, con efectos ya incrustados.
El último movimiento cierra en **6,0 s**; de ahí al final la imagen está quieta.

---

## El guion

Pega esto tal cual en el TTS de CapCut:

```
Con estas tasas cerramos la semana. Entre el dólar BCV y el de Binance hay más de dieciséis por ciento de brecha. Síguenos para verlas cada día y únete a nuestro canal de WhatsApp.
```

**34 palabras · ~10 s a velocidad 1.0x.**

### Cómo cuadra con la imagen

| Tramo | Voz | Qué se ve |
| --- | --- | --- |
| 0,0 – 2,2 s | "Con estas tasas cerramos la semana." | Cabecera y entra el dólar BCV |
| 2,2 – 6,5 s | "Entre el dólar BCV y el de Binance hay más de dieciséis por ciento de brecha." | Entran las tres filas restantes y aterriza la tarjeta de la brecha |
| 6,5 – 10,0 s | "Síguenos para verlas cada día y únete a nuestro canal de WhatsApp." | Imagen quieta: el cuadro completo |

---

## Dirección de voz

- **Femenina, español latinoamericano.** Evita las voces peninsulares: el público
  está en la frontera colombo-venezolana y un acento de España suena ajeno.
- **Cálida y calmada de base, no locutora de radio.** El contenido es dinero y
  confianza; una voz acelerada suena a publicidad y resta credibilidad.
- **El entusiasmo entra en dos sitios concretos**, no repartido por igual:
  - en "**más de dieciséis por ciento**", que es el dato que sorprende;
  - en "**Síguenos**", donde arranca el CTA.
- **Velocidad 1.0x.** Si se pasa de 10 s, sube a 1.05x antes que recortar palabras.
- **Deja medio segundo de silencio al empezar.** El primer whoosh cae en 0,26 s;
  si la voz entra encima, se pisan.

## Mapa sonoro — dónde hay ya efectos

Todo esto viene incrustado en el MP4. Te sirve para colocar la voz sin chocar:

| Tiempo | Efecto | Qué acompaña |
| --- | --- | --- |
| 0,26 s | whoosh | Entra el título |
| 0,95 s | whoosh | Entra el dólar BCV |
| 1,70 s | whoosh | Entra Binance compra |
| 2,45 s | whoosh | Entra Binance venta |
| 3,20 s | whoosh | Entra el dólar frontera |
| 3,60 – 4,80 s | riser | Tensión durante la quietud previa al remate |
| 4,80 s | impacto grave | **Aterriza la brecha** — es el pico de la pieza |
| 4,95 s | sparkle | Acompaña el barrido de acento |
| 5,87 s | chime | Entra el pie con la marca: la señal del CTA |

**El hueco bueno para la frase del dato** es de 3,3 a 4,7 s: ahí solo suena el riser
de fondo. **El impacto de 4,80 s conviene dejarlo respirar** — que la voz no diga
nada justo en ese instante es lo que hace que se sienta.

## Niveles

Los efectos están mezclados **bajos a propósito**, con cabecera para la voz:

- pico **−6,4 dB**, media **−19,2 dB** (medido con `ffmpeg volumedetect`).

Eso deja unos 6 dB libres. Mete la voz alrededor de **−12 dB de media** y no toques
los efectos; si aun así te tapan, baja la pista del video en CapCut antes que subir
la voz, que es lo que provoca la saturación.

---

## Por qué el guion dice lo que dice

- **No lee ninguna cifra completa.** Decir "setecientos ochenta y cuatro coma sesenta
  y seis" cuesta casi tres segundos por número; los cuatro no caben ni de lejos. La
  imagen ya las muestra, y en un Reel la voz compite con ellas en vez de sumar. La voz
  aporta el **titular**; la pantalla, el **detalle**.
- **Dice "más de dieciséis por ciento", no "dieciséis".** En pantalla se lee `16,4`.
  Redondear en la voz haría que voz e imagen dijeran cifras distintas — justo lo que
  esta app no puede permitirse. "Más de dieciséis" es exacto y cabe.
- **Nombra BCV y Binance, no "oficial y paralelo".** Son las etiquetas que están en
  pantalla y las que usa el proyecto. "Paralelo" es la palabra de la calle, pero no
  aparece en ningún sitio de la app y obligaría al espectador a traducir.
- **El CTA cae en el sostenido.** Es el único tramo sin movimiento, así que la voz no
  pelea con nada entrando o contando.

## Ajustes para el TTS de CapCut

- **Los números van escritos con letra** ("dieciséis"), no en dígitos. Con `16,4` el
  motor puede leer "dieciséis coma cuatro" o "dieciséis con cuatro" según la voz, y no
  hay forma de saber cuál sin probarlo.
- **BCV se lee deletreado** ("be-ce-uve") y ocupa más de lo que aparenta: cuenta como
  dos palabras y media al presupuestar.
- **Los puntos marcan la respiración.** Los tres del guion separan los tres tramos de
  la tabla de arriba; si el resultado va apretado, alarga la pausa ahí antes que
  acelerar la voz.
