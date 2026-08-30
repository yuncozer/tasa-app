/**
 * El resumen del día: qué salió, cómo cerraron las tasas y cómo le fue al
 * sitio y a la cuenta.
 *
 * No añade ninguna capacidad nueva —todo esto ya se puede mirar en `/admin`—
 * pero lo trae sin que haya que ir a buscarlo, que es la diferencia entre un
 * panel que se consulta y un sistema que informa. Sale una vez al día, de
 * noche, cuando ya no queda nada por publicar.
 *
 * **Cada bloque se lee y falla por su cuenta**, igual que en la agenda y en
 * `/admin/analiticas`: un Supabase caído no puede dejar sin resumen a las
 * métricas de Instagram, ni un token vencido sin las del sitio. Lo que no se
 * pudo leer sale como "sin dato" y nunca como cero — sería mentir sobre un día
 * que a lo mejor estuvo bien.
 *
 * Si **nada** se pudo leer no se manda correo: un mensaje que solo dice "sin
 * dato" cuatro veces es ruido, y el fallo que lo causó ya avisa por su cuenta.
 */

import { brechaDelSnapshot } from "@/lib/brecha";
import { leerAnaliticasWeb } from "@/lib/analiticas-web";
import { diaCaracasISO, formatPercent, formatRate } from "@/lib/format";
import { momentosArchivados } from "@/lib/historico";
import { registrarSeguidores } from "@/lib/historico-instagram";
import { leerAnaliticasInstagram } from "@/lib/instagram-insights";
import { leerParadaPendiente } from "@/lib/parada";
import { getRates } from "@/lib/rates";

export interface ResumenDia {
  fecha: string;
  /** Cada línea ya viene lista para leerse; el correo no calcula nada. */
  publicaciones: string[];
  tasas: string[];
  sitio: string[];
  instagram: string[];
  /** Si no se pudo leer absolutamente nada, no hay resumen que mandar. */
  vacio: boolean;
}

function linea(etiqueta: string, valor: string): string {
  return `${etiqueta}: ${valor}`;
}

async function bloquePublicaciones(hoy: string): Promise<string[]> {
  const lineas: string[] = [];

  try {
    const momentos = await momentosArchivados(hoy);
    lineas.push(linea("Post de la mañana", momentos.includes("manana") ? "publicado" : "no salió"));
    lineas.push(linea("Post de la tarde", momentos.includes("tarde") ? "publicado" : "no salió"));
  } catch {
    lineas.push(linea("Posts de tasas", "sin dato"));
  }

  try {
    const borrador = await leerParadaPendiente();
    if (borrador) {
      const esDeHoy = diaCaracasISO(new Date(borrador.detectadoEn).getTime()) === hoy;
      lineas.push(
        linea(
          "Dólar en La Parada",
          borrador.publicado
            ? esDeHoy
              ? "publicado"
              : "sin artículo nuevo hoy"
            : "borrador sin publicar",
        ),
      );
    }
  } catch {
    // La Parada no siempre tiene algo que decir; si falla, se calla.
  }

  return lineas;
}

async function bloqueTasas(): Promise<string[]> {
  try {
    const snapshot = await getRates();
    const brecha = brechaDelSnapshot(snapshot);

    return [
      linea("Dólar BCV", formatRate(snapshot.rates.USD_BCV.bsPerUnit)),
      linea("Dólar Binance (venta)", formatRate(snapshot.rates.USD_BINANCE_SELL.bsPerUnit)),
      linea("Brecha", brecha === null ? "sin dato" : formatPercent(brecha)),
    ];
  } catch {
    return [];
  }
}

async function bloqueSitio(): Promise<string[]> {
  try {
    const web = await leerAnaliticasWeb(1);
    const clics = (atajo: string) => web.atajos.find((fila) => fila.clave === atajo)?.total ?? 0;

    return [
      linea("Sesiones", String(web.totales.sesiones)),
      linea("Conversiones", String(web.totales.conversiones)),
      linea("Cifras copiadas", String(web.totales.copias)),
      linea("Clics al canal de WhatsApp", String(clics("/wa"))),
      linea("Clics al post del día", String(clics("/hoy"))),
    ];
  } catch {
    return [];
  }
}

async function bloqueInstagram(): Promise<string[]> {
  // `leerAnaliticasInstagram` no lanza: degrada métrica a métrica. Un `null`
  // aquí significa "la cuenta no expone eso", y sale como "sin dato".
  const ig = await leerAnaliticasInstagram(1, 1);

  // De paso se anota el número de seguidores del día: la Graph API no guarda
  // histórico y sin esto la cifra del panel no se puede comparar con nada.
  // Va aquí y no en una llamada aparte porque el perfil ya está leído, y
  // `registrarSeguidores` nunca lanza.
  await registrarSeguidores(ig.perfil.seguidores, ig.perfil.publicaciones);
  const numero = (valor: number | null | undefined) =>
    valor === null || valor === undefined ? "sin dato" : String(valor);

  const lineas = [
    linea("Alcance", numero(ig.totales.reach)),
    linea("Interacciones", numero(ig.totales.total_interactions)),
    linea("Seguidores", numero(ig.perfil.seguidores)),
  ];

  const ultimo = ig.publicaciones[0];
  if (ultimo) {
    lineas.push(linea("Último post · alcance", numero(ultimo.alcance)));
  }

  return lineas;
}

export async function construirResumenDia(): Promise<ResumenDia> {
  const hoy = diaCaracasISO(Date.now());

  const [publicaciones, tasas, sitio, instagram] = await Promise.all([
    bloquePublicaciones(hoy),
    bloqueTasas(),
    bloqueSitio(),
    bloqueInstagram().catch(() => []),
  ]);

  return {
    fecha: hoy,
    publicaciones,
    tasas,
    sitio,
    instagram,
    vacio: [publicaciones, tasas, sitio, instagram].every((bloque) => bloque.length === 0),
  };
}
