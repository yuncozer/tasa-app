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
 * Suelo de la franja azul. No lo marca el texto sino el **bloque de marca**: el
 * círculo del logo y el `@latasa.online` tienen que caber dentro, así que por
 * debajo de esto la franja no puede encoger por corto que sea el titular.
 *
 * Por arriba no hay tope: la franja crece con el texto (ver `altoFranja`).
 */
const ALTO_MINIMO_FRANJA = 150;

/**
 * Aire de la franja por arriba y por abajo. Con dos líneas de titular y crédito
 * deja la franja en ~176 px, a un pelo de los 180 que medía cuando el alto era
 * fijo — el cintillo de siempre no cambia de tamaño, solo deja de estar
 * atrapado en él.
 */
const RELLENO_FRANJA = 15;

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

/**
 * Sube a mano cuando cambie el diseño. Entra en el `public_id` del cintillo
 * (ver `asegurarCintillo`), así que sin subirlo los videos seguirían usando
 * el PNG viejo ya cacheado en Cloudinary.
 */
export const VERSION_CINTILLO = 3;

/** El prefijo lo pone el código, para que todos los posts acrediten igual. */
const PREFIJO_FUENTE = "Fuente: ";

/**
 * Tope del titular, y **no** es el límite de dos líneas que hubo aquí: la
 * franja crece con el texto, así que tres, cuatro o más líneas son un caso
 * normal y el cintillo se hace más alto para acomodarlas.
 *
 * Lo que queda es un tope de seguridad, alto a propósito (~8 líneas): pasado
 * cierto punto la banda tapa medio video, y un titular de ese tamaño ya no se
 * lee de pasada, que es para lo que existe el cintillo.
 */
const MAX_TITULO = 200;

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

/** Tipografía del titular y del crédito, en un solo sitio: la medida los usa. */
const TITULO = { tamano: 46, interlineado: 1.15 };
const CREDITO = { tamano: 22, interlineado: 1.2 };

/** Hueco entre el titular y el crédito. */
const GAP_TEXTO = 6;

/**
 * Ancho por el que envuelve el titular: la franja menos sus márgenes y menos
 * la columna que tiene reservada el bloque de marca.
 */
const ANCHO_TEXTO = ANCHO - MARGEN * 2 - COLUMNA_MARCA - GAP;

/**
 * Caracteres que se dan por línea al estimar cuánto va a ocupar el titular.
 *
 * Es una estimación y no una medida real: Satori exige el alto del lienzo
 * **antes** de maquetar, así que no hay forma de preguntarle cuántas líneas
 * salieron. El número va deliberadamente por lo bajo —a 46 px de Geist Bold
 * caben unos 32 en los {@link ANCHO_TEXTO} px útiles— porque los dos errores no
 * cuestan igual: pasarse de líneas solo deja lienzo transparente de más, que
 * Cloudinary no muestra al anclar la capa abajo, mientras que quedarse corto
 * recortaría el titular.
 */
const CARACTERES_POR_LINEA = 26;

/** Líneas de más que se reservan, por el mismo motivo: sobrar es gratis. */
const LINEAS_DE_HOLGURA = 1;

/**
 * Alto de la franja para unos datos dados. Es la misma cuenta que hace el
 * navegador al maquetar, hecha a mano porque Satori necesita el alto por
 * adelantado; de ahí que el titular se estime y el resto se sume exacto.
 */
function altoFranja({ titulo, fuente }: DatosCintillo): number {
  const lineas = titulo
    ? Math.ceil(recortarTitulo(titulo).length / CARACTERES_POR_LINEA) + LINEAS_DE_HOLGURA
    : 0;

  const contenido =
    lineas * Math.round(TITULO.tamano * TITULO.interlineado) +
    (fuente ? Math.round(CREDITO.tamano * CREDITO.interlineado) : 0) +
    (titulo && fuente ? GAP_TEXTO : 0);

  return Math.max(ALTO_MINIMO_FRANJA, contenido + RELLENO_FRANJA * 2 + BORDE * 2);
}

function Cintillo({ titulo, fuente }: DatosCintillo) {
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
      {/* Envoltorio de la pieza. Existe para que el círculo del logo se
          posicione respecto a ella y no respecto al lienzo: el lienzo se pide
          con holgura (ver `generarCintillo`) y lo que sobra queda arriba, así
          que un `top: 0` sobre el lienzo dejaría el logo flotando lejos de la
          franja. El `paddingTop` es justo lo que el círculo asoma. */}
      <div style={{ width: "100%", display: "flex", position: "relative", paddingTop: ASOMA }}>
        {/* La franja, cerrada arriba y abajo por dos filetes del verde de marca:
            es lo que la hace leer como cintillo de canal y no como un subtítulo.
            Va con alto mínimo y no fijo: crece con las líneas del titular. */}
        <div
          style={{
            width: "100%",
            minHeight: ALTO_MINIMO_FRANJA,
            display: "flex",
            alignItems: "center",
            backgroundColor: COLOR.surface,
            borderTop: `${BORDE}px solid ${COLOR.accent}`,
            borderBottom: `${BORDE}px solid ${COLOR.accent}`,
            // A la izquierda se reserva el sitio del círculo, que se dibuja
            // aparte para poder sobresalir por encima de la franja.
            padding: `${RELLENO_FRANJA}px ${MARGEN}px ${RELLENO_FRANJA}px ${MARGEN + COLUMNA_MARCA + GAP}px`,
          }}
        >
          {/* El bloque de texto ocupa todo el hueco que queda a la derecha del
              logo y centra su contenido dentro. Se centra con la caja a ancho
              completo y no encogiéndola al texto: una caja ajustada al
              contenido se mediría a línea completa y un titular largo se
              saldría en vez de envolver. Así un titular corto queda centrado en
              ese hueco y uno de varias líneas envuelve y se centra línea a
              línea.

              Hacen falta las dos propiedades y no basta una: `justifyContent`
              coloca la línea suelta —una sola línea es un único hijo del flex—
              y `textAlign` alinea las demás cuando el texto envuelve. Van en
              cada `span` porque heredadas del contenedor no llegan a todos
              (comprobado: el crédito se quedaba a la izquierda). */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: GAP_TEXTO }}>
            {titulo ? (
              <span
                style={{
                  display: "flex",
                  width: ANCHO_TEXTO,
                  justifyContent: "center",
                  textAlign: "center",
                  fontSize: TITULO.tamano,
                  fontWeight: 700,
                  color: COLOR.foreground,
                  lineHeight: TITULO.interlineado,
                }}
              >
                {recortarTitulo(titulo)}
              </span>
            ) : null}

            {/* El crédito acompaña al titular, así que se alinea con él. Sin
                titular es la única línea de la franja y se queda a la
                izquierda, que es como salía la variante baja. */}
            {fuente ? (
              <span
                style={{
                  display: "flex",
                  width: ANCHO_TEXTO,
                  justifyContent: titulo ? "center" : "flex-start",
                  textAlign: titulo ? "center" : "left",
                  fontSize: CREDITO.tamano,
                  lineHeight: CREDITO.interlineado,
                  color: COLOR.muted,
                }}
              >
                {`${PREFIJO_FUENTE}${fuente}`}
              </span>
            ) : null}
          </div>
        </div>

        {/* Logo y cuenta, arriba a la izquierda. El círculo se posiciona en vez
            de ir en el flujo para que pueda asomar por encima del filete
            superior: dentro de la franja no habría forma de sacarlo. */}
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

          {/* La cuenta viaja con el video si alguien lo descarga y lo difunde.
              Va deliberadamente pequeña: tiene que leerse, no competir con el
              titular. */}
          <span style={{ display: "flex", fontSize: 20, color: COLOR.muted }}>@latasa.online</span>
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
    // El lienzo se pide con holgura y la pieza se ancla abajo, así que lo que
    // sobre queda arriba y sale transparente. No se ve: Cloudinary superpone la
    // capa por su borde inferior (`gravity: south`), de modo que unos píxeles
    // vacíos de más no mueven la franja ni un milímetro. Es lo que permite
    // estimar el alto del titular por lo bajo sin arriesgarse a recortarlo.
    height: altoFranja(datos) + ASOMA,
    fonts: [
      { name: "Geist", data: regular as unknown as ArrayBuffer, weight: 400, style: "normal" },
      { name: "Geist", data: bold as unknown as ArrayBuffer, weight: 700, style: "normal" },
    ],
  });

  return Buffer.from(await respuesta.arrayBuffer());
}
