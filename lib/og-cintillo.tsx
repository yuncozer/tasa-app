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
 * Alto de la franja azul, ajustado al contenido y no a ojo: dos líneas de
 * titular a 46 px con interlineado 1,15 son ~106 px, más el hueco y el crédito
 * suman ~143 px. Lo que sobra hasta aquí es el aire de arriba y abajo — con los
 * 260 px de antes eran más de 100 px de franja tapando video para nada.
 *
 * La de solo crédito no baja más porque su suelo no es el texto sino el bloque
 * de marca: el círculo del logo y el `@latasa.online` tienen que caber dentro.
 */
const ALTO_FRANJA = { completo: 180, credito: 150 };

/** Grosor de los filetes de marca que cierran la franja arriba y abajo. */
const BORDE = 4;

/**
 * Corrección para centrar la taza **ópticamente** dentro del círculo.
 *
 * El dibujo es asimétrico —el asa sale a la derecha y el platillo carga abajo—,
 * así que centrarlo por su caja lo deja visiblemente bajo y escorado. Medido
 * sobre el PNG, su centro de masa cae 1,9 px a la izquierda y 3,7 px por debajo
 * del centro del círculo; esto lo compensa.
 */
const AJUSTE_LOGO = { x: 2, y: -3 };

/** El logo, y el círculo que lo enmarca con aire alrededor. */
const LOGO = 80;
const AIRE_LOGO = 16;
const BORDE_CIRCULO = 4;
const CIRCULO = LOGO + AIRE_LOGO * 2 + BORDE_CIRCULO * 2;

/**
 * Cuánto asoma el círculo por encima de la franja. Es también el hueco que hay
 * que reservar en el lienzo: si no, Satori recortaría lo que sobresale.
 */
const ASOMA = 34;

/** Alto total del PNG: la franja más lo que el círculo saca por arriba. */
const ALTO = {
  completo: ALTO_FRANJA.completo + ASOMA,
  credito: ALTO_FRANJA.credito + ASOMA,
};

/**
 * Sube a mano cuando cambie el diseño. Entra en el `public_id` del cintillo
 * (ver `asegurarCintillo`), así que sin subirlo los videos seguirían usando
 * el PNG viejo ya cacheado en Cloudinary.
 */
export const VERSION_CINTILLO = 2;

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

/** Margen lateral de la franja; el bloque de marca se alinea con él. */
const MARGEN = 40;

/**
 * Ancho reservado al bloque de marca. Lo fija el `@latasa.online`, que es más
 * ancho que el círculo: sin reservarlo, el texto se sale por debajo del logo y
 * se monta sobre el titular.
 */
const COLUMNA_MARCA = 150;

/** Separación entre el bloque de marca y el texto del cintillo. */
const GAP = 24;

function Cintillo({ titulo, fuente }: DatosCintillo) {
  const altoFranja = titulo ? ALTO_FRANJA.completo : ALTO_FRANJA.credito;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        alignItems: "flex-end",
        fontFamily: "Geist",
        // Sin `backgroundColor`: es lo que deja ver el video alrededor.
      }}
    >
      {/* La franja, cerrada arriba y abajo por dos filetes del verde de marca:
          es lo que la hace leer como cintillo de canal y no como un subtítulo.
          Va con el alto fijado porque el círculo del logo, al ir posicionado,
          ya no la estira. */}
      <div
        style={{
          width: "100%",
          height: altoFranja,
          display: "flex",
          alignItems: "center",
          backgroundColor: COLOR.surface,
          borderTop: `${BORDE}px solid ${COLOR.accent}`,
          borderBottom: `${BORDE}px solid ${COLOR.accent}`,
          // A la izquierda se reserva el sitio del círculo, que se dibuja
          // aparte para poder sobresalir por encima de la franja.
          padding: `0 ${MARGEN}px 0 ${MARGEN + COLUMNA_MARCA + GAP}px`,
        }}
      >
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

      {/* Logo y cuenta, arriba a la izquierda. El círculo se posiciona en vez de
          ir en el flujo para que pueda asomar por encima del filete superior:
          dentro de la franja no habría forma de sacarlo. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: MARGEN,
          width: COLUMNA_MARCA,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: CIRCULO,
            height: CIRCULO,
            borderRadius: CIRCULO / 2,
            // Más oscuro que la franja, para que el círculo se lea como pieza
            // aparte y no como un recorte de ella.
            backgroundColor: COLOR.background,
            border: `${BORDE_CIRCULO}px solid ${COLOR.accent}`,
          }}
        >
          <div
            style={{
              display: "flex",
              transform: `translate(${AJUSTE_LOGO.x}px, ${AJUSTE_LOGO.y}px)`,
            }}
          >
            <LogoTaza />
          </div>
        </div>

        {/* La cuenta viaja con el video si alguien lo descarga y lo difunde. Va
            deliberadamente pequeña: tiene que leerse, no competir con el
            titular. */}
        <span style={{ display: "flex", fontSize: 20, color: COLOR.muted }}>@latasa.online</span>
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
