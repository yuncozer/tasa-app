import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { construirAlertaBrecha, type AlertaBrecha } from "@/lib/alerta-brecha";
import { diaCaracasISO, formatClock, formatFechaCorta, formatVariacion } from "@/lib/format";
import {
  AIRE_LATERAL,
  avisoBrecha,
  COLOR,
  LogoTaza,
  Pie,
  leerFontBuffer,
  leerImagenComoDataUri,
  leerSvgComoDataUri,
} from "@/lib/og-shared";
import { getRates } from "@/lib/rates";
import type { DireccionVariacion } from "@/lib/semanal";

/**
 * Imagen de la alerta de brecha: cuánto se paga de más fuera del BCV y cuánto
 * se movió esa distancia en una semana.
 *
 * Va **sin firma HMAC**, igual que `instagram-semanal` y por el mismo criterio:
 * no recibe ni un carácter de texto libre —lee las tasas y el histórico del
 * servidor— y su única entrada es un valor de un conjunto cerrado. Firmarla
 * añadiría los 403 por conjunto desajustado sin cerrar nada.
 */
export const runtime = "nodejs";

type Proporcion = "1:1" | "9:16";

const SIZE: Record<Proporcion, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

interface Medidas {
  padding: number;
  /**
   * Aire extra arriba y abajo del lienzo vertical, por lo mismo que en
   * `instagram-semanal`: en una Story Instagram superpone su interfaz y lo que
   * caiga ahí queda tapado, así que los 840 px de diferencia entre los dos
   * lienzos no se reparten proporcionalmente.
   */
  reservaArriba: number;
  reservaAbajo: number;
  logo: number;
  wordmark: number;
  handle: number;
  banda: number;
  cifra: number;
  flecha: number;
  concepto: number;
  etiqueta: number;
  valorTarjeta: number;
  variacion: number;
  remate: number;
  remateValor: number;
  /** Relleno del panel que sostiene las cifras sobre la foto. */
  paddingPanel: number;
}

const MEDIDAS: Record<Proporcion, Medidas> = {
  "1:1": {
    padding: 56,
    reservaArriba: 0,
    reservaAbajo: 0,
    logo: 62,
    wordmark: 44,
    handle: 24,
    banda: 42,
    cifra: 132,
    flecha: 96,
    concepto: 42,
    etiqueta: 26,
    valorTarjeta: 56,
    variacion: 42,
    remate: 40,
    remateValor: 46,
    paddingPanel: 22,
  },
  "9:16": {
    padding: 72,
    reservaArriba: 110,
    reservaAbajo: 130,
    logo: 84,
    wordmark: 58,
    handle: 30,
    banda: 46,
    cifra: 210,
    flecha: 150,
    concepto: 54,
    etiqueta: 32,
    valorTarjeta: 82,
    variacion: 60,
    remate: 42,
    remateValor: 52,
    paddingPanel: 40,
  },
};

/**
 * El rojo de esta plantilla, más vivo que el `--danger` del sistema.
 *
 * `COLOR.danger` (#f87171) está calibrado para texto pequeño sobre fondo
 * oscuro —la columna de variaciones del reporte semanal— y ahí funciona. Aquí
 * tiene que sostener una franja de borde a borde y competir con una foto
 * detrás: al mismo tono pálido, la franja se leía apagada, como un aviso más y
 * no como la alerta que es. Se define **local a esta ruta** y no se toca el
 * token global: el semanal sigue con el suyo, donde el problema no existe.
 *
 * Lo usan la franja y todos los detalles que acompañan a una brecha que sube
 * —la flecha, la variación y el borde de la tarjeta de hoy— para que la imagen
 * tenga un solo rojo y no dos parecidos.
 */
const ROJO = "#e11d2f";

/**
 * El color va por impacto y no por signo, igual que en el reporte semanal: una
 * brecha que se abre es peor para quien lee, así que sube → rojo y baja →
 * verde. Sin movimiento no se pinta ninguno de los dos, que sería insinuar una
 * dirección que no hay.
 */
function colorDe(direccion: DireccionVariacion): string {
  if (direccion === "sube") return ROJO;
  if (direccion === "baja") return COLOR.accent;
  return COLOR.muted;
}

function flechaDe(direccion: DireccionVariacion): string {
  if (direccion === "sube") return "↑";
  if (direccion === "baja") return "↓";
  return "";
}

function Cabecera({ medidas }: { medidas: Medidas }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <LogoTaza tamano={medidas.logo} />
        <div style={{ display: "flex", fontSize: medidas.wordmark, fontWeight: 700 }}>
          <span style={{ color: COLOR.foreground }}>La&nbsp;</span>
          <span style={{ color: COLOR.accent }}>Tasa</span>
        </div>
      </div>
      <span style={{ fontSize: medidas.handle, color: COLOR.muted, marginTop: 6 }}>@latasa.online</span>
    </div>
  );
}

/**
 * La banda del titular, que es lo que hace de esto una alerta y no un dato
 * más. El "URGENTE" solo aparece cuando la brecha se abrió: es lo que motiva
 * el post, y ponerlo también sobre un "se cerró" o un "se mantiene"
 * convertiría la palabra en decoración.
 */
function Banda({ alerta, medidas }: { alerta: AlertaBrecha; medidas: Medidas }) {
  const color = colorDe(alerta.direccion);
  const urgente = alerta.direccion === "sube";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        backgroundColor: urgente ? ROJO : COLOR.surface,
        // Sin radio ni margen: la franja va de borde a borde del lienzo, que es
        // lo que la hace leerse como un rótulo de noticiero y no como una
        // píldora más de las que ya tiene la imagen. Por eso el relleno lateral
        // del lienzo lo ponen los bloques y no el contenedor raíz.
        borderTop: `2px solid ${urgente ? ROJO : color}`,
        borderBottom: `2px solid ${urgente ? ROJO : color}`,
        padding: `14px ${medidas.padding}px`,
        fontSize: medidas.banda,
        fontWeight: 700,
        color: urgente ? COLOR.foreground : color,
        letterSpacing: 1,
        // Centrado explícito: en el lienzo vertical el titular envuelve a dos
        // líneas, y `justifyContent` solo coloca la línea suelta.
        textAlign: "center",
      }}
    >
      {urgente ? `URGENTE | ${alerta.titular}` : alerta.titular}
    </div>
  );
}

/** Una de las dos cifras comparadas. La de hoy va resaltada con el color de la dirección. */
function TarjetaComparativa({
  etiqueta,
  valor,
  destacada,
  color,
  medidas,
}: {
  etiqueta: string;
  valor: string;
  destacada: boolean;
  color: string;
  medidas: Medidas;
}) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        alignItems: "center",
        backgroundColor: COLOR.surface,
        // Las dos llevan el mismo grosor de borde y solo cambian de color: con
        // 1 px contra 3 px, las cifras quedaban a distinta altura.
        border: `3px solid ${destacada ? color : COLOR.border}`,
        borderRadius: 24,
        padding: "18px 20px",
      }}
    >
      <span style={{ fontSize: medidas.etiqueta, color: COLOR.muted }}>{etiqueta}</span>
      <span
        style={{
          fontSize: medidas.valorTarjeta,
          fontWeight: 700,
          color: destacada ? COLOR.foreground : COLOR.muted,
          marginTop: 6,
        }}
      >
        {valor}
      </span>
    </div>
  );
}

function BrechaImage({
  alerta,
  proporcion,
  icons,
  fondo,
}: {
  alerta: AlertaBrecha;
  proporcion: Proporcion;
  icons: { instagram: string; browser: string };
  /** La foto de fondo, ya embebida como data URI. */
  fondo: string;
}) {
  const medidas = MEDIDAS[proporcion];
  const color = colorDe(alerta.direccion);
  const flecha = flechaDe(alerta.direccion);
  const sinComparacion = alerta.direccion === "desconocida";

  const { width, height } = SIZE[proporcion];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: COLOR.background,
        paddingTop: medidas.padding + medidas.reservaArriba,
        paddingBottom: medidas.padding + medidas.reservaAbajo,
        fontFamily: "Geist",
      }}
    >
      {/* La foto va como capa y no como `backgroundImage`: Satori no compone
          varias capas de fondo, y aquí hacen falta dos —la foto y el velo que
          la apaga— para que el texto se lea encima. El `<img>` se estira al
          lienzo con `objectFit: "cover"`, que es lo que le permite servir
          igual al cuadrado y al vertical. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
      <img
        src={fondo}
        width={width}
        height={height}
        alt=""
        style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
      />
      {/* El velo no es estética: sobre la foto sin apagar, el gris de las
          etiquetas y el aviso legal del pie dejan de leerse. El degradado
          aprieta arriba y abajo, que es donde caen el titular y el pie, y deja
          respirar el centro, donde la foto se ve entre las tarjetas. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          display: "flex",
          backgroundImage:
            `linear-gradient(180deg, rgba(11,17,32,0.94) 0%, rgba(11,17,32,0.72) 40%, ` +
            `rgba(11,17,32,0.9) 70%, rgba(11,17,32,0.97) 88%, rgba(11,17,32,0.98) 100%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <Cabecera medidas={medidas} />
        <Banda alerta={alerta} medidas={medidas} />
      </div>

      {/* Las cifras van sobre un panel propio y no directamente sobre la foto:
          con el fondo a la vista, el gris de las etiquetas y de la línea de
          "sin comparación" se pierde entre los billetes. El panel es
          semitransparente para que la foto siga leyéndose detrás. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginLeft: medidas.padding + AIRE_LATERAL,
          marginRight: medidas.padding + AIRE_LATERAL,
          padding: medidas.paddingPanel,
          borderRadius: 32,
          backgroundColor: "rgba(11,17,32,0.72)",
          border: `1px solid ${COLOR.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {flecha && (
            <span style={{ fontSize: medidas.flecha, fontWeight: 700, color, lineHeight: 1 }}>{flecha}</span>
          )}
          <span style={{ fontSize: medidas.cifra, fontWeight: 700, color: COLOR.foreground, lineHeight: 1 }}>
            {alerta.brechaTexto}
          </span>
        </div>

        {/* Dos líneas explícitas: el corte natural partiría "USDT BINANCE". */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: medidas.concepto,
            fontWeight: 700,
            color: COLOR.foreground,
            lineHeight: 1.15,
            marginTop: 14,
          }}
        >
          <span>BRECHA USDT BINANCE</span>
          <span>VS DÓLAR BCV</span>
        </div>

        {/* Sin dato de hace una semana no se pintan las tarjetas ni la
            variación: un "0,0 pp" ahí sería un número inventado. Tampoco se
            explica la ausencia — al lector no le interesa el estado de nuestro
            histórico, y una línea sobre lo que falta le quita sitio a la única
            cifra que sí hay. La imagen se queda con la brecha de hoy, que es
            correcta por sí sola; el `titular` ya cambia a "ASÍ ESTÁ LA BRECHA"
            en vez de anunciar un movimiento que no se puede afirmar. Es
            distinto del semanal, donde `Sin comparación` ocupa el hueco de una
            columna que las otras tarjetas sí llenan. */}
        {sinComparacion ? null : (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 26 }}>
            <div style={{ display: "flex", gap: 20 }}>
              <TarjetaComparativa
                etiqueta="hace una semana"
                valor={alerta.brechaAntesTexto}
                destacada={false}
                color={color}
                medidas={medidas}
              />
              <TarjetaComparativa
                etiqueta="hoy"
                valor={alerta.brechaTexto}
                destacada
                color={color}
                medidas={medidas}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
              <span style={{ fontSize: medidas.variacion, fontWeight: 700, color }}>
                {/* La magnitud llega en valor absoluto y el signo lo dice la
                    flecha, igual que en el semanal: se afirma una sola vez. */}
                {flecha} {formatVariacion(alerta.variacion, "puntos")}
              </span>
              <span style={{ fontSize: medidas.etiqueta, color: COLOR.muted }}>
                {formatClock(alerta.capturadoEn)} · {formatFechaCorta(alerta.capturadoEn)}
              </span>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            width: "100%",
            backgroundColor: COLOR.surface,
            border: `1px solid ${COLOR.border}`,
            borderRadius: 9999,
            padding: "16px 28px",
            marginTop: 22,
          }}
        >
          {/* `nowrap` en las dos mitades: dentro del panel el ancho es menor
              que el del lienzo, y partido en dos líneas el remate deja de
              leerse de un vistazo, que es todo lo que tiene que hacer. */}
          <span style={{ fontSize: medidas.remate, fontWeight: 700, color: COLOR.foreground, whiteSpace: "nowrap" }}>
            VALOR USDT HOY:
          </span>
          <span
            style={{ fontSize: medidas.remateValor, fontWeight: 700, color: COLOR.accent, whiteSpace: "nowrap" }}
          >
            {alerta.valorParaleloTexto}
          </span>
        </div>
      </div>

      {/* `position: relative` para que quede por encima del velo, que es
          absoluto y va después en el flujo. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          paddingLeft: medidas.padding,
          paddingRight: medidas.padding,
        }}
      >
        <Pie icons={icons} aviso={avisoBrecha(!sinComparacion)} />
      </div>
    </div>
  );
}

function proporcionDesdeQuery(request: NextRequest): Proporcion {
  return request.nextUrl.searchParams.get("proporcion") === "9:16" ? "9:16" : "1:1";
}

/**
 * `?comparar=0` publica solo la brecha de hoy, sin el "hace una semana" ni la
 * variación: la elige el admin en `/admin/brecha`.
 *
 * Que la ruta acepte esta clave no contradice la ausencia de firma: no falsea
 * ningún dato —lo que muestra sigue saliendo de las tasas del servidor— y es un
 * valor de un conjunto cerrado, igual que `proporcion`. Lo que la firma evita
 * en `instagram-post-news` es texto libre, y aquí sigue sin haberlo.
 */
function compararDesdeQuery(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("comparar") !== "0";
}

export async function GET(request: NextRequest) {
  const proporcion = proporcionDesdeQuery(request);
  const comparar = compararDesdeQuery(request);

  const [snapshot, geistRegular, geistBold, instagramIcon, browserIcon, fondo] = await Promise.all([
    getRates(),
    leerFontBuffer("Geist-Regular.ttf"),
    leerFontBuffer("Geist-Bold.ttf"),
    leerSvgComoDataUri("instagram-icon.svg"),
    leerSvgComoDataUri("browser-icon.svg"),
    leerImagenComoDataUri("fondo-brecha.jpg"),
  ]);

  const alerta = await construirAlertaBrecha(snapshot, { comparar });

  const imagen = new ImageResponse(
    <BrechaImage
      alerta={alerta}
      proporcion={proporcion}
      icons={{ instagram: instagramIcon, browser: browserIcon }}
      fondo={fondo}
    />,
    {
      ...SIZE[proporcion],
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
      ],
    },
  );

  // La descarga va por cabecera y no con el atributo `download` de HTML, que en
  // iOS es poco fiable y el admin trabaja desde el teléfono.
  if (request.nextUrl.searchParams.get("descargar") !== "1") return imagen;

  const dia = diaCaracasISO(new Date(alerta.capturadoEn).getTime());
  const nombre = `brecha-${dia}-${proporcion === "9:16" ? "9x16" : "1x1"}.png`;
  const cabeceras = new Headers(imagen.headers);
  cabeceras.set("Content-Disposition", `attachment; filename="${nombre}"`);

  return new Response(imagen.body, { status: imagen.status, headers: cabeceras });
}
