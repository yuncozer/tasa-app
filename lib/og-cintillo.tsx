import { ImageResponse } from "next/og";
import { COLOR, LogoTaza, leerFontBuffer } from "@/lib/og-shared";

/**
 * Cintillo de noticiero que se superpone a los videos: barra inferior con la
 * marca, el titular del post y, si se acredita, la fuente del clip.
 *
 * Vive aquí y no en la sintaxis de transformaciones de Cloudinary por tres
 * motivos que se pagaron en su momento intentando lo contrario:
 *
 * - La única tipografía que Cloudinary tenía a mano era Arial, que no es la
 *   del proyecto. Aquí se usa Geist, la misma de las imágenes.
 * - El texto de un overlay de Cloudinary viaja **dentro del path** de la URL,
 *   donde `,` separa parámetros y `/` separa componentes. Un titular real
 *   lleva comas, y `limpiarFuente()` existe solo por eso. Aquí el texto no
 *   toca ninguna URL.
 * - Un cintillo son varios elementos, y en Cloudinary cada uno es un
 *   `overlay` más un `fl_layer_apply` colocado a mano en píxeles, sin ajuste
 *   de línea. Aquí es flexbox.
 *
 * Cloudinary sigue haciendo lo que sí hace bien: superponer **una** capa ya
 * compuesta sobre el video, que es exactamente lo que ya hace con el sello.
 *
 * El PNG sale con fondo transparente porque el contenedor raíz no declara
 * `backgroundColor` (verificado: `hasAlpha`, `isOpaque: false`). Si alguien le
 * pone un fondo, el cintillo taparía el video entero.
 */

/** Ancho de los tres lienzos de video, así que un mismo cintillo sirve para todos. */
const ANCHO = 1080;

/**
 * Alto de cada variante. La de solo crédito es más baja porque no tiene
 * titular que alojar: dejarla igual de alta comería video para nada.
 */
const ALTO = { completo: 260, credito: 130 };

/**
 * Sube a mano cuando cambie el diseño. Entra en el `public_id` del cintillo
 * (ver `asegurarCintillo`), así que sin subirlo los videos seguirían usando
 * el PNG viejo ya cacheado en Cloudinary.
 */
export const VERSION_CINTILLO = 1;

/** El prefijo lo pone el código, para que todos los posts acrediten igual. */
const PREFIJO_FUENTE = "Fuente: ";

/**
 * Tope del titular. Se recorta por caracteres y no con `line-clamp` de CSS
 * porque Satori no lo implementa: sin este tope, un titular largo empuja la
 * caja y se sale del lienzo en vez de cortarse.
 *
 * El número sale del ancho útil: a 46 px entran unos 30 caracteres por línea,
 * y el cintillo está dimensionado para dos. Con 84 se colaba una tercera línea
 * que apretaba el bloque contra los bordes (comprobado).
 */
const MAX_TITULO = 60;

export interface DatosCintillo {
  /** Sin título sale la variante baja, solo con el crédito. */
  titulo?: string;
  fuente?: string;
}

/** Normaliza el titular y lo acota al alto disponible del cintillo. */
export function recortarTitulo(valor: string): string {
  const limpio = valor.replace(/\s+/g, " ").trim();
  return limpio.length > MAX_TITULO ? `${limpio.slice(0, MAX_TITULO).trimEnd()}…` : limpio;
}

function Cintillo({ titulo, fuente }: DatosCintillo) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        fontFamily: "Geist",
        // Sin `backgroundColor`: es lo que deja ver el video alrededor.
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 28,
          backgroundColor: COLOR.surface,
          // El filo de acento es lo que lo hace leer como cintillo de canal y
          // no como un subtítulo cualquiera.
          borderLeft: `12px solid ${COLOR.accent}`,
          padding: titulo ? "28px 40px" : "20px 40px",
        }}
      >
        <LogoTaza />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6 }}>
          {titulo ? (
            <span
              style={{
                display: "flex",
                fontSize: 46,
                fontWeight: 700,
                color: COLOR.foreground,
                lineHeight: 1.15,
              }}
            >
              {recortarTitulo(titulo)}
            </span>
          ) : null}

          {fuente ? (
            <span style={{ display: "flex", fontSize: 26, color: COLOR.muted }}>
              {`${PREFIJO_FUENTE}${fuente}`}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Rasteriza el cintillo a PNG. Devuelve el buffer en vez de una `Response`
 * porque no hay ruta pública que lo sirva: el PNG se sube a Cloudinary y es
 * Cloudinary quien lo consume. A diferencia de `instagram-post-news`, aquí no
 * hace falta firma HMAC — nadie externo tiene que poder descargarlo.
 */
export async function generarCintillo(datos: DatosCintillo): Promise<Buffer> {
  const [regular, bold] = await Promise.all([
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
  ]);

  const respuesta = new ImageResponse(<Cintillo {...datos} />, {
    width: ANCHO,
    height: datos.titulo ? ALTO.completo : ALTO.credito,
    fonts: [
      { name: "Geist", data: regular as unknown as ArrayBuffer, weight: 400, style: "normal" },
      { name: "Geist", data: bold as unknown as ArrayBuffer, weight: 700, style: "normal" },
    ],
  });

  return Buffer.from(await respuesta.arrayBuffer());
}
