import { COLOR, LogoTaza, Pie } from "@/lib/og-shared";
import { normalizarTituloParada } from "@/lib/parada";

/**
 * El lienzo de "Dólar en La Parada", aparte de su route para poder
 * dibujarlo sin pasar por Supabase al iterar el diseño — mismo criterio que
 * `lib/og-cintillo.tsx` frente a la ruta que lo sirve.
 *
 * Va en **4:5** (1080×1350), el lienzo más alto que acepta el feed de
 * Instagram. Lo que se enmarca aquí es la foto de la pizarra de la casa de
 * cambio, que es vertical: en cuadrado había que recortarla a media tabla y
 * se perdían justo las filas de abajo. Los 270 px de más son todos para la
 * foto; el resto del bloque no cambia.
 */
export const TAMANO_PARADA = { width: 1080, height: 1350 };

/** Cuánto de la foto del artículo se ve dentro del marco. */
const ALTO_FOTO = 700;

/** Aviso legal de esta serie: no es "esta noticia es de terceros" (`AVISO_NOTICIA`), es "este dato es informal y puede cambiar". */
export function avisoParada(lugar: string): string {
  return `Tasa informal registrada en un punto físico (${lugar}). Puede variar durante el día y no equivale a la tasa oficial.`;
}

function Tarjeta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        backgroundColor: "#1c2740",
        borderRadius: 16,
        padding: "18px 22px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: COLOR.accent, letterSpacing: 2 }}>{etiqueta}</span>
        <span style={{ fontSize: 18, color: COLOR.muted }}>Billete de 100$</span>
      </div>
      {/*
       * "COP" va a la mitad del tamaño de la cifra: la unidad se sobreentiende
       * y lo que el lector busca de un vistazo es el número. A la misma altura
       * competían entre sí, y en una imagen que se mira de pasada eso cuesta
       * la lectura. Se alinean por la base para que "COP" no flote.
       */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 60, fontWeight: 700, color: COLOR.accent }}>{valor}</span>
        <span style={{ fontSize: 30, fontWeight: 700, color: COLOR.accent }}>COP</span>
      </div>
    </div>
  );
}

export function PortadaParada({
  titulo,
  lugar,
  compra,
  venta,
  imageDataUri,
  icons,
}: {
  titulo: string;
  lugar: string;
  compra: string;
  venta: string;
  imageDataUri: string;
  icons: { instagram: string; browser: string };
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: COLOR.background,
        padding: 40,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LogoTaza />
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>
              <span style={{ color: COLOR.foreground }}>La&nbsp;</span>
              <span style={{ color: COLOR.accent }}>Tasa</span>
            </div>
          </div>
          <span style={{ fontSize: 24, color: COLOR.muted, fontWeight: 700 }}>@latasa.online</span>
        </div>

        <div style={{ display: "flex", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1px solid ${COLOR.kicker}`,
              borderRadius: 9999,
              padding: "10px 22px",
            }}
          >
            <span style={{ fontSize: 22 }}>📍</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: COLOR.kicker }}>{lugar}</span>
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, color: COLOR.foreground, letterSpacing: 3 }}>
            TASA LA PARADA
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: `2px solid ${COLOR.kicker}`,
          borderRadius: 24,
          overflow: "hidden",
          marginTop: 15,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori rasteriza, no es una <img> de navegador. */}
        <img
          src={imageDataUri}
          width={1000}
          height={ALTO_FOTO}
          style={{ objectFit: "cover", width: "100%", height: ALTO_FOTO }}
          alt=""
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, backgroundColor: COLOR.surface, padding: "24px 28px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 38, fontWeight: 700, color: COLOR.foreground, lineHeight: 1.2 }}>
              {normalizarTituloParada(titulo)}
            </span>
            <span style={{ fontSize: 22, color: COLOR.muted }}>Fuente: lanacionweb.com</span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", flex: 1 }}>
              <Tarjeta etiqueta="COMPRAN" valor={compra} />
            </div>
            <div style={{ display: "flex", flex: 1 }}>
              <Tarjeta etiqueta="VENDEN" valor={venta} />
            </div>
          </div>
        </div>
      </div>

      <Pie icons={icons} aviso={avisoParada(lugar)} />
    </div>
  );
}
