import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Piezas compartidas entre las plantillas de imagen de Instagram
 * (`app/api/og/instagram-post` y `app/api/og/instagram-post-news`): paleta,
 * logo, carga de fuentes/SVGs y el pie de página. Todo hardcodeado en vez de
 * leer `globals.css`/Tailwind porque Satori no interpreta CSS ni clases.
 */

export const COLOR = {
  background: "#0b1120",
  surface: "#131c2f",
  border: "#26324c",
  foreground: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#34d399",
  warning: "#fbbf24",
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

/** Lee un archivo de fuente `.ttf` compartido por ambas plantillas de imagen. */
export async function leerFontBuffer(nombre: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "app/api/og/_assets", nombre));
}

/** Lee un SVG de `public/SVG` y lo convierte a data URI para Satori. */
export async function leerSvgComoDataUri(nombre: string): Promise<string> {
  const buffer = await readFile(path.join(process.cwd(), "public/SVG", nombre));
  return `data:image/svg+xml;base64,${buffer.toString("base64")}`;
}

export function LogoTaza() {
  return (
    <svg
      width={80}
      height={80}
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
