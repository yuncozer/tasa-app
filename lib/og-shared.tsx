import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Piezas compartidas entre las plantillas de imagen de Instagram
 * (`app/api/og/instagram-post` y `app/api/og/instagram-post-news`): paleta,
 * logo, carga de fuentes/SVGs y el pie de página. Todo hardcodeado en vez de
 * leer `globals.css`/Tailwind porque Satori no interpreta CSS ni clases.
 */

/**
 * Cuánto se meten hacia dentro el encabezado y las filas de tasas, por encima
 * del relleno del lienzo.
 *
 * No es holgura estética: WhatsApp y la cuadrícula del perfil de Instagram
 * recortan la imagen por los lados, y con el contenido pegado al borde se
 * comían justo el dato — «ar BCV» en vez de «Dólar BCV», «757,5» en vez de
 * «757,54» (visto en vivo). El pie no lo usa a propósito: el aviso legal puede
 * seguir aprovechando todo el ancho porque no es lo que se lee de un vistazo.
 *
 * Vive aquí, y no en cada plantilla, porque las dos diapositivas del post
 * diario tienen que moverse juntas o el carrusel queda descuadrado.
 */
export const AIRE_LATERAL = 40;

export const COLOR = {
  background: "#0b1120",
  surface: "#131c2f",
  border: "#26324c",
  foreground: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#34d399",
  warning: "#fbbf24",
  /**
   * Para una variación que sube. El reporte semanal pinta las subidas de rojo
   * y las bajadas de verde: el color dice qué significa el cambio para quien
   * lee —una tasa que sube es una devaluación—, no si el número creció. La
   * flecha sí sigue el signo, así que las dos informaciones se ven por
   * separado.
   */
  danger: "#f87171",
  /** El "REPORTE SEMANAL" que corona la imagen del reporte. */
  kicker: "#38bdf8",
};

/**
 * Aviso legal del post diario: los números que se muestran son tasas.
 * No se quita ni se suaviza.
 */
export const AVISO_TASAS =
  "La Tasa muestra tasas obtenidas de fuentes públicas de terceros con fines " +
  "exclusivamente informativos. No fijamos, certificamos ni garantizamos ninguna " +
  "tasa de cambio, no intervenimos en operaciones de compra o venta de divisas y " +
  "nada de lo aquí mostrado constituye asesoría financiera. Los datos pueden estar " +
  "desactualizados o contener errores: confirma siempre con la fuente oficial antes " +
  "de cerrar cualquier operación.";

/**
 * Aviso legal del post de noticias: lo que se muestra es contenido de un
 * tercero, no una tasa. Misma exigencia de estar siempre visible, redactado
 * para dejar claro que La Tasa no es la autora ni certifica la noticia.
 */
export const AVISO_NOTICIA =
  "Esta noticia proviene de terceros; La Tasa no es su autora, no la " +
  "certifica ni garantiza su exactitud. Se comparte con fines informativos.";

/**
 * Aviso del reporte semanal. Es más corto que `AVISO_TASAS` porque en esa
 * imagen lo que se muestra no es una tasa para operar sino cuánto se movió, y
 * porque el pie ya carga con el rango de fechas; lo esencial —de dónde salen
 * los números y que hay que confirmarlos en la fuente— se mantiene.
 */
export const AVISO_SEMANAL =
  "Fuentes: BCV, Binance P2P y Banco de la República (TRM). Variación calculada " +
  "contra el dato de hace una semana. Datos con fines exclusivamente informativos: " +
  "La Tasa no fija ni certifica ninguna tasa y esto no es asesoría financiera. " +
  "Confirma siempre con la fuente oficial.";

/** Lee un archivo de fuente `.ttf` compartido por ambas plantillas de imagen. */
export async function leerFontBuffer(nombre: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "app/api/og/_assets", nombre));
}

/** Lee un SVG de `public/SVG` y lo convierte a data URI para Satori. */
export async function leerSvgComoDataUri(nombre: string): Promise<string> {
  const buffer = await readFile(path.join(process.cwd(), "public/SVG", nombre));
  return `data:image/svg+xml;base64,${buffer.toString("base64")}`;
}

/**
 * El `tamano` es opcional y por defecto vale 80, que es el de las plantillas
 * del post diario: el reporte semanal lo encoge en el lienzo cuadrado, donde
 * cada píxel de alto hace falta para las tarjetas.
 */
export function LogoTaza({ tamano = 80 }: { tamano?: number } = {}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke={COLOR.accent}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M11 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M14.5 2.2c-.7.9-.7 1.8 0 2.7" />
      <path d="M3.5 8h13.5v5.6a5.2 5.2 0 0 1-5.2 5.2H8.7A5.2 5.2 0 0 1 3.5 13.6V8Z" />
      <path d="M17 9.6h1.3a2.6 2.6 0 0 1 0 5.2H17" />
      <path d="M2.5 21.3h16" />
    </svg>
  );
}

/** Header con logo, wordmark "La Tasa" y subtítulo, común a ambas plantillas. */
export function Encabezado({ subtitulo }: { subtitulo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <LogoTaza />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>
          <span style={{ color: COLOR.foreground }}>La&nbsp;</span>
          <span style={{ color: COLOR.accent }}>Tasa</span>
        </div>
        <span style={{ fontSize: 28, color: COLOR.muted }}>{subtitulo}</span>
      </div>
    </div>
  );
}

/**
 * Fila de una tasa: bandera, nombre y monto, dentro de una píldora.
 *
 * La comparten el post en bolívares y el post en pesos, que son la misma
 * plantilla con otra moneda al lado del número.
 *
 * Debajo del nombre caben dos líneas opcionales e independientes: `sublabel`
 * (hoy, la vigencia del BCV) y `fuente`. La fuente va en `--muted` porque es
 * lo que el sistema de estilos reserva para las procedencias, y separada de
 * `sublabel` para poder darle ese color sin teñir también la vigencia.
 *
 * El texto de `sublabel` llega con su puntuación ya puesta: quien llama sabe
 * si necesita paréntesis, y hay etiquetas que ya traen los suyos ("Dólar
 * frontera (compra)").
 */
export function FilaMoneda({
  banderaSrc,
  label,
  sublabel,
  fuente,
  valor,
  noDisponible,
}: {
  banderaSrc: string;
  label: string;
  sublabel?: string;
  fuente?: string;
  valor: string;
  noDisponible: boolean;
}) {
  const color = noDisponible ? COLOR.warning : COLOR.accent;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        border: `2px solid ${color}`,
        backgroundColor: COLOR.surface,
        borderRadius: 9999,
        padding: "16px 34px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "flex",
            width: 56,
            height: 56,
            borderRadius: 9999,
            overflow: "hidden",
            border: `2px solid ${COLOR.border}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
          <img src={banderaSrc} width={56} height={56} style={{ objectFit: "cover", borderRadius: 9999 }} alt="" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 32, color: COLOR.foreground }}>{label}</span>
          {sublabel && (
            <span style={{ fontSize: 24, color: COLOR.foreground, fontWeight: 500, textTransform: "capitalize" }}>
              {sublabel}
            </span>
          )}
          {fuente && <span style={{ fontSize: 22, color: COLOR.muted }}>{fuente}</span>}
        </div>
      </div>
      <span style={{ fontSize: 50, fontWeight: 700, color }}>{valor}</span>
    </div>
  );
}

/** Línea de contacto + párrafo legal del pie de página, común a ambas plantillas. */
export function Pie({ icons, aviso }: { icons: { instagram: string; browser: string }; aviso: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        borderTop: `1px solid ${COLOR.border}`,
        paddingTop: 24,
      }}
    >
      <span style={{ fontSize: 20, color: COLOR.foreground, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
        <img src={icons.browser} width={34} height={34} alt="" />  www.latasa.online
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
        <img src={icons.instagram} width={34} height={34} alt="" /> @latasa.online
      </span>
      <span style={{ fontSize: 16, color: COLOR.muted, lineHeight: 1.5, textAlign: "center" }}>{aviso}</span>
    </div>
  );
}
