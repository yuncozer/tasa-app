/**
 * `<link rel="apple-touch-startup-image">` para cada tamaño de iPhone.
 *
 * iOS no lee `app/manifest.ts` para el splash screen de apps instaladas —eso
 * es cosa de Android/Chrome—; solo muestra una imagen estática si se le da
 * el tamaño exacto del dispositivo por este medio. Next hoiza estos `<link>`
 * al `<head>` aunque se rendericen dentro de `<body>`, así que no hace falta
 * `next/head`.
 *
 * Esta lista debe coincidir con `PANTALLAS_IOS` de
 * `scripts/generar-iconos.mjs`: una genera los archivos y esta apunta a ellos.
 */
const PANTALLAS_IOS = [
  { w: 320, h: 568, r: 2 }, // SE (1.ª gen)
  { w: 375, h: 667, r: 2 }, // 6/7/8, SE (2.ª/3.ª gen)
  { w: 414, h: 736, r: 3 }, // 6+/7+/8+
  { w: 375, h: 812, r: 3 }, // X/XS/11 Pro, 12/13 mini
  { w: 414, h: 896, r: 2 }, // XR/11
  { w: 414, h: 896, r: 3 }, // XS Max/11 Pro Max
  { w: 390, h: 844, r: 3 }, // 12/13/14
  { w: 393, h: 852, r: 3 }, // 14 Pro/15/15 Pro/16/16 Pro
  { w: 428, h: 926, r: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 430, h: 932, r: 3 }, // 14 Pro Max/15 Plus/15 Pro Max/16 Plus/16 Pro Max
];

export function AppleSplashLinks() {
  return (
    <>
      {PANTALLAS_IOS.map(({ w, h, r }) => {
        const ancho = w * r;
        const alto = h * r;
        return (
          <link
            key={`${ancho}x${alto}`}
            rel="apple-touch-startup-image"
            href={`/splash/${ancho}x${alto}.png`}
            media={`screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`}
          />
        );
      })}
    </>
  );
}
