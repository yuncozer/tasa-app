import type { Metadata } from "next";
import Link from "next/link";
import {
  Copy,
  Eye,
  Heart,
  AtSign,
  Link2,
  MessageCircle,
  MousePointerClick,
  Repeat,
  Smartphone,
  Sparkles,
  Users,
  WifiOff,
} from "lucide-react";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BarrasDias } from "@/components/admin/BarrasDias";
import { EsqueletoAnaliticas } from "@/components/admin/Esqueleto";
import { SelloDeHora } from "@/components/admin/SelloDeHora";
import { ListaConteo } from "@/components/admin/ListaConteo";
import { TarjetaMetrica } from "@/components/admin/TarjetaMetrica";
import { leerAnaliticasWeb, type AnaliticasWeb } from "@/lib/analiticas-web";
import { construirFichaAnunciante, LO_QUE_NO_SABEMOS, MINIMO_SESIONES } from "@/lib/ficha-anunciante";
import { formatEntero, formatFechaCorta, formatPercent } from "@/lib/format";
import { construirConsejos, type Consejo } from "@/lib/consejos-instagram";
import { crecimientoSeguidores, type CrecimientoSeguidores } from "@/lib/historico-instagram";
import {
  leerAnaliticasInstagram,
  resumenActividad,
  variacionPorcentual,
  type AnaliticasInstagram,
} from "@/lib/instagram-insights";
import { rateMeta } from "@/lib/rates";
import type { RateKey } from "@/lib/types";

export const metadata: Metadata = {
  title: "Analíticas — La Tasa",
};

/**
 * Las dos mitades del proyecto en una pantalla: qué hace la gente en la
 * calculadora y cómo le va a lo que se publica.
 *
 * Existe porque Vercel Analytics no responde ninguna de las preguntas que de
 * verdad se hacen aquí —con qué moneda se convierte, cuánta gente copia la
 * cifra, cuánta abre la app instalada o sin señal— y porque el rendimiento de
 * Instagram vivía en su propia app, sin forma de mirarlo al lado del uso del
 * sitio. La analítica web sale de `eventos_web` (migración `0010`), propia y
 * anónima; la de redes, de la Graph API en vivo.
 *
 * **Las dos mitades se leen por separado y degradan por separado.** Un
 * Supabase caído no puede dejar sin métricas de Instagram, ni un token
 * caducado sin las de la web: son dos fuentes independientes y el panel se
 * abre para mirar, así que media pantalla con datos vale más que una pantalla
 * de error — mismo criterio que las insignias del dashboard.
 *
 * **Son tres pestañas y no una página larga**: Calculadora, Enlaces e
 * Instagram. No se comparan entre sí —nadie lee "sesiones de la calculadora"
 * al lado de "alcance del post" para sacar una conclusión— y juntas obligaban
 * a bajar media pantalla en el teléfono. Separadas, además, cada una se
 * **carga sola**: mirar la calculadora ya no gasta las cinco llamadas a la
 * Graph API que nadie va a leer. Calculadora y Enlaces comparten la misma
 * consulta —la de `analiticas_web`, que devuelve el panel entero en un solo
 * viaje— así que separarlas no cuesta nada.
 *
 * **Las pestañas y el selector se pintan antes que los datos.** Cada bloque
 * cuelga de un `<Suspense>` con su propio esqueleto, así que al cambiar de
 * pestaña o de período los controles siguen ahí y solo se repinta el
 * contenido — sin eso, la pantalla entera se sustituía por el esqueleto
 * genérico de `/admin` y se perdía de vista dónde se había pulsado. La `key`
 * del `Suspense` es lo que hace que vuelva a suspenderse en cada cambio: sin
 * ella React reutilizaría el subárbol y dejaría las cifras viejas en pantalla
 * mientras llegan las nuevas, que en un panel de cifras se lee como un dato
 * que no cuadra.
 *
 * La pestaña y el período viajan por query string (`?vista=` y `?dias=`) y no
 * en estado de cliente: la página ya se renderiza en el servidor y un enlace
 * normal resuelve el caso sin JavaScript, igual que el `?vista=` de
 * `/historial`.
 */

const PERIODOS = [7, 30, 90] as const;
const POR_DEFECTO = 30;

/**
 * La Graph API no devuelve métricas de cuenta más allá de 30 días, así que el
 * período de 90 solo estira la mitad web. Se dice en pantalla en vez de
 * recortar el selector: la pregunta "¿cómo viene el trimestre en el sitio?" es
 * legítima aunque Instagram no la acompañe.
 */
const MAX_DIAS_INSTAGRAM = 30;

const VISTAS = ["calculadora", "audiencia", "enlaces", "instagram"] as const;
type Vista = (typeof VISTAS)[number];

/** La calculadora primero: es el sitio propio, y lo de Instagram ya se ve en Instagram. */
const VISTA_POR_DEFECTO: Vista = "calculadora";

function leerDias(valor: string | undefined): number {
  const dias = Number(valor);
  return PERIODOS.includes(dias as (typeof PERIODOS)[number]) ? dias : POR_DEFECTO;
}

function leerVista(valor: string | undefined): Vista {
  return VISTAS.includes(valor as Vista) ? (valor as Vista) : VISTA_POR_DEFECTO;
}

/**
 * Las dos pestañas. Cada enlace **conserva el período** que ya estaba
 * elegido: cambiar de mitad no es cambiar de pregunta, y volver a los 30 días
 * por defecto cada vez obligaría a reelegirlo a cada salto.
 */
function Pestanas({ vista, dias }: { vista: Vista; dias: number }) {
  const etiquetas: Record<Vista, string> = {
    calculadora: "Calculadora",
    audiencia: "Audiencia",
    enlaces: "Enlaces",
    instagram: "Instagram",
  };

  return (
    <nav
      aria-label="Qué analíticas se ven"
      className="flex gap-2 border-b border-border-soft pb-3"
    >
      {VISTAS.map((opcion) => {
        const activa = opcion === vista;
        return (
          <Link
            key={opcion}
            href={`/admin/analiticas?vista=${opcion}&dias=${dias}`}
            aria-current={activa ? "page" : undefined}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
              activa
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-soft bg-surface text-muted"
            }`}
          >
            {etiquetas[opcion]}
          </Link>
        );
      })}
    </nav>
  );
}

function SelectorPeriodo({ vista, dias }: { vista: Vista; dias: number }) {
  return (
    <nav aria-label="Período" className="flex gap-2">
      {PERIODOS.map((opcion) => {
        const activo = opcion === dias;
        return (
          <Link
            key={opcion}
            href={`/admin/analiticas?vista=${vista}&dias=${opcion}`}
            aria-current={activo ? "page" : undefined}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
              activo
                ? "border-accent bg-accent/15 text-accent"
                : "border-border-soft bg-surface text-muted"
            }`}
          >
            {opcion} días
          </Link>
        );
      })}
    </nav>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
      {children}
    </p>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{titulo}</h2>
      {children}
    </section>
  );
}

/** El caption entero no cabe en una fila; la primera línea ya identifica el post. */
function resumenCaption(caption: string | null): string {
  if (!caption) return "Sin texto";
  const primera = caption.split("\n").find((linea) => linea.trim() !== "") ?? "Sin texto";
  return primera.length > 70 ? `${primera.slice(0, 70)}…` : primera;
}

function BloqueWeb({ datos, dias }: { datos: AnaliticasWeb; dias: number }) {
  const { totales } = datos;
  // Cuántas de las sesiones que entraron llegaron a hacer una cuenta. Es la
  // única cifra derivada del panel, y la que responde si la calculadora se usa
  // o solo se mira.
  const tasaConversion =
    totales.sesiones > 0 ? (totales.conversiones / totales.sesiones) * 100 : null;

  return (
    <Seccion titulo={`Últimos ${dias} días`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaMetrica etiqueta="Sesiones" valor={totales.sesiones} apoyo="Pestañas distintas" icono={Users} />
        <TarjetaMetrica etiqueta="Visitas" valor={totales.visitas} apoyo="Pantallas abiertas" icono={Eye} />
        <TarjetaMetrica
          etiqueta="Conversiones"
          icono={Repeat}
          valor={totales.conversiones}
          apoyo={
            tasaConversion === null
              ? undefined
              : `${formatPercent(tasaConversion)} de las sesiones`
          }
        />
        <TarjetaMetrica
          etiqueta="Cifras copiadas"
          icono={Copy}
          valor={totales.copias}
          apoyo="El número que viaja por WhatsApp"
        />
      </div>

      <div className="rounded-2xl border border-border-soft bg-surface px-4 py-4">
        <BarrasDias
          etiqueta="Sesiones por día"
          serie={datos.serie.map((dia) => ({ fecha: dia.fecha, valor: dia.sesiones }))}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <TarjetaMetrica
          etiqueta="Desde la app instalada"
          icono={Smartphone}
          valor={totales.sesionesInstaladas}
          apoyo={`Sesiones · ${formatEntero(totales.instalaciones)} instalaciones nuevas`}
        />
        <TarjetaMetrica
          etiqueta="Sin conexión"
          icono={WifiOff}
          valor={totales.sesionesSinConexion}
          apoyo="Sesiones que llegaron a usarla sin señal"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ListaConteo
          titulo="Moneda de origen"
          filas={datos.monedas}
          etiquetar={(clave) => {
            try {
              return rateMeta(clave as RateKey).label;
            } catch {
              return clave;
            }
          }}
        />
        <ListaConteo titulo="Pantallas más abiertas" filas={datos.rutas} />
        <ListaConteo titulo="De dónde llega la gente" filas={datos.referentes} />
        <ListaConteo titulo="Dispositivo" filas={datos.dispositivos} />
      </div>
    </Seccion>
  );
}

/**
 * Los atajos del dominio: `/hoy`, `/wa`, `/ig`, `/laparada` y `/p/<slug>`.
 *
 * Son los enlaces que viajan en los captions de Instagram y en el mensaje del
 * canal de WhatsApp, así que esta pestaña responde lo único que se puede
 * responder sobre el canal: **cuánta gente lo abre desde aquí**. El canal en
 * sí no tiene API —ni de publicación ni de lectura—, que es el mismo motivo
 * por el que `/admin/canal` arma el mensaje para pegarlo a mano; de sus
 * seguidores o del alcance de cada mensaje no hay forma de saber nada sin
 * teclearlo, y un número tecleado a mano en un panel envejece mintiendo.
 *
 * Se cuenta por clics y no por sesiones distintas: se registran en el
 * servidor, donde no hay pestaña con la que correlacionar nada. Los
 * rastreadores quedan fuera (`registrarAtajo`), que es lo que hace utilizable
 * la cifra de `/hoy` — el de WhatsApp la pide cada vez que alguien pega el
 * enlace en un chat.
 */
const NOMBRE_ATAJO: Record<string, string> = {
  "/hoy": "/hoy · post de tasas del día",
  "/wa": "/wa · canal de WhatsApp",
  "/ig": "/ig · perfil de Instagram",
  "/laparada": "/laparada · post de La Parada",
  "/e": "/e/… · posts compartidos al canal",
};

function BloqueEnlaces({ datos, dias }: { datos: AnaliticasWeb; dias: number }) {
  // Un atajo sin un solo clic no aparece en el desglose, y su tarjeta tiene
  // que decir "0" y no "—": aquí el cero es una medición, no un hueco —
  // sabemos que nadie lo abrió, que es justo lo que se vino a mirar.
  const clics = (atajo: string) => datos.atajos.find((fila) => fila.clave === atajo)?.total ?? 0;

  return (
    <Seccion titulo={`Últimos ${dias} días`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <TarjetaMetrica
          etiqueta="Clics en atajos"
          icono={MousePointerClick}
          valor={datos.totales.atajos}
          apoyo="Sin rastreadores"
        />
        <TarjetaMetrica etiqueta="Canal de WhatsApp" icono={MessageCircle} valor={clics("/wa")} apoyo="/wa" />
        <TarjetaMetrica etiqueta="Post del día" icono={Link2} valor={clics("/hoy")} apoyo="/hoy" />
        <TarjetaMetrica
          etiqueta="La Parada"
          icono={Link2}
          valor={clics("/laparada")}
          apoyo="/laparada"
        />
        <TarjetaMetrica etiqueta="Perfil" icono={AtSign} valor={clics("/ig")} apoyo="/ig" />
      </div>

      <div className="rounded-2xl border border-border-soft bg-surface px-4 py-4">
        <BarrasDias
          etiqueta="Clics por día"
          serie={datos.serie.map((dia) => ({ fecha: dia.fecha, valor: dia.atajos }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ListaConteo
          titulo="Por enlace"
          filas={datos.atajos}
          etiquetar={(clave) => NOMBRE_ATAJO[clave] ?? clave}
        />
        <ListaConteo
          titulo="De dónde venía el clic"
          filas={datos.referentesAtajos}
          vacio="Ningún clic llegó con referente: es lo normal cuando el enlace se abre desde la app de Instagram o desde WhatsApp, que no lo declaran."
        />
      </div>
    </Seccion>
  );
}

/**
 * Qué hacer con las cifras de arriba.
 *
 * Es la única parte del panel que sugiere en vez de contar, así que lleva su
 * propia letra pequeña: cada consejo trae la cifra que lo sostiene, para que
 * se pueda contrastar en la misma pantalla. Las reglas viven en
 * `lib/consejos-instagram.ts` — explícitas y sin IA, para que se puedan
 * discutir y corregir.
 *
 * Sin material suficiente no se calla del todo: dice que aún no hay con qué
 * opinar, que es distinto de que no haya nada que decir.
 */
function Consejos({ consejos }: { consejos: Consejo[] }) {
  if (consejos.length === 0) {
    return (
      <p className="rounded-2xl border border-border-soft bg-surface px-4 py-3 text-xs text-muted">
        Todavía no hay suficientes publicaciones ni histórico para sacar conclusiones. Con unos días
        más de datos aparecen aquí.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {consejos.map((consejo) => (
        <li
          key={consejo.titulo}
          className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 ${
            consejo.tono === "atencion"
              ? "border-warning/40 bg-warning/10"
              : consejo.tono === "bien"
                ? "border-accent/40 bg-accent/10"
                : "border-border-soft bg-surface"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              consejo.tono === "atencion"
                ? "text-warning"
                : consejo.tono === "bien"
                  ? "text-accent"
                  : "text-foreground"
            }`}
          >
            {consejo.titulo}
          </p>
          <p className="text-xs leading-relaxed text-muted">{consejo.porque}</p>
        </li>
      ))}
    </ul>
  );
}

function BloqueInstagram({
  datos,
  dias,
  consejos,
  crecimiento,
}: {
  datos: AnaliticasInstagram;
  dias: number;
  consejos: Consejo[];
  crecimiento: CrecimientoSeguidores;
}) {
  const periodo = Math.min(dias, MAX_DIAS_INSTAGRAM);

  return (
    <Seccion titulo={`Últimos ${periodo} días`}>
      {dias > MAX_DIAS_INSTAGRAM && (
        <p className="text-xs text-muted">
          Instagram no devuelve métricas de cuenta más allá de {MAX_DIAS_INSTAGRAM} días, así que
          esta mitad se queda en ese período.
        </p>
      )}

      {datos.avisos.map((aviso) => (
        <Aviso key={aviso}>{aviso}</Aviso>
      ))}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaMetrica
          etiqueta="Seguidores"
          icono={Users}
          valor={datos.perfil.seguidores}
          apoyo={
            crecimiento.anterior === null
              ? "Sin histórico todavía"
              : `Hace ${dias} días: ${formatEntero(crecimiento.anterior)}`
          }
          variacion={{
            porcentaje: variacionPorcentual(datos.perfil.seguidores, crecimiento.anterior),
          }}
        />
        <TarjetaMetrica
          etiqueta="Alcance"
          icono={Eye}
          valor={datos.totales.reach}
          apoyo="Cuentas distintas"
          variacion={{
            porcentaje: variacionPorcentual(datos.totales.reach, datos.totalesAnteriores.reach),
          }}
        />
        <TarjetaMetrica
          etiqueta="Interacciones"
          icono={Heart}
          valor={datos.totales.total_interactions}
          apoyo="Me gusta, comentarios y guardados"
          variacion={{
            porcentaje: variacionPorcentual(
              datos.totales.total_interactions,
              datos.totalesAnteriores.total_interactions,
            ),
          }}
        />
        <TarjetaMetrica
          etiqueta="Visitas al perfil"
          icono={Sparkles}
          valor={datos.totales.profile_views}
          apoyo={`Comparado con los ${dias} días anteriores`}
          variacion={{
            porcentaje: variacionPorcentual(
              datos.totales.profile_views,
              datos.totalesAnteriores.profile_views,
            ),
          }}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Qué hacer</h3>
        <Consejos consejos={consejos} />
      </section>

      {datos.alcanceDiario.length > 0 && (
        <div className="rounded-2xl border border-border-soft bg-surface px-4 py-4">
          <BarrasDias etiqueta="Alcance por día" serie={datos.alcanceDiario} />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Últimas publicaciones
        </h3>

        {datos.publicaciones.length === 0 ? (
          <p className="text-sm text-muted">Sin publicaciones que mostrar.</p>
        ) : (
          <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface">
            {datos.publicaciones.map((post) => (
              <li key={post.id} className="flex flex-col gap-2 px-4 py-3">
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium transition active:scale-95"
                >
                  {resumenCaption(post.caption)}
                </a>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{formatFechaCorta(post.timestamp)}</span>
                  <span className="tabular">Alcance {formatEntero(post.alcance)}</span>
                  <span className="tabular">Interacciones {formatEntero(post.interacciones)}</span>
                  <span className="tabular">Me gusta {formatEntero(post.meGusta)}</span>
                  <span className="tabular">Guardados {formatEntero(post.guardados)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Seccion>
  );
}

/**
 * Los tres bloques envueltos en su propia lectura.
 *
 * El `fetch` vive aquí dentro y no en la página para que `<Suspense>` tenga
 * algo que esperar: si la página los resolviera antes de renderizar, el
 * esqueleto no llegaría a verse nunca y volveríamos a la pantalla en blanco.
 */
/**
 * La ficha con la que se cotiza un patrocinio.
 *
 * Va en su propia pestaña y no dentro de "Calculadora" porque no se lee para
 * lo mismo: aquella responde "¿la app le sirve a alguien?" y esta "¿qué le
 * digo a quien quiere pagar?". Son las mismas filas de `eventos_web` leídas
 * con otra pregunta, y mezclarlas obligaría a traducir cada cifra al vuelo en
 * mitad de una conversación.
 *
 * Cada cifra viene con **la cuenta que la sostiene** y con **qué significa**:
 * un porcentaje suelto en una reunión es indefendible en cuanto alguien
 * pregunta de dónde sale. Y la pantalla dice también lo que **no** se puede
 * afirmar, que en una negociación vale tanto como lo que sí — prometer datos
 * demográficos obligaría a empezar a guardarlos, y esta analítica es anónima
 * por diseño.
 */
function BloqueAudiencia({ datos, dias }: { datos: AnaliticasWeb; dias: number }) {
  const ficha = construirFichaAnunciante(datos);

  return (
    <Seccion titulo={`Ficha de audiencia · ${dias} días`}>
      {!ficha.suficiente && (
        <Aviso>
          Con {formatEntero(ficha.sesiones)} sesiones en el período, estos porcentajes se mueven
          demasiado con cada visita suelta como para sostenerlos delante de nadie: faltan{" "}
          {formatEntero(ficha.faltan)} para el mínimo de {MINIMO_SESIONES}. Las cifras se muestran
          igual, para seguir la evolución, pero no las lleves todavía a una conversación comercial.
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {ficha.cifras.map((cifra) => (
          <div
            key={cifra.clave}
            className="flex h-full flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-4"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {cifra.etiqueta}
            </span>
            <span className="tabular text-2xl font-semibold text-foreground">
              {cifra.clave === "alcance-diario" || cifra.clave === "salidas"
                ? formatEntero(cifra.valor === null ? null : Math.round(cifra.valor))
                : formatPercent(cifra.valor)}
            </span>
            <span className="text-xs leading-relaxed text-foreground">{cifra.lectura}</span>
            <span className="mt-auto pt-1 text-[11px] leading-relaxed text-muted">
              {cifra.soporte}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaConteo
          titulo="Con qué monedas convierte"
          filas={datos.monedas}
          etiquetar={(clave) => rateMeta(clave as RateKey)?.label ?? clave}
          vacio="Todavía no hay conversiones en el período."
        />
        <ListaConteo
          titulo="De dónde llega"
          filas={datos.referentes}
          vacio="Casi todo el tráfico llega sin referente, que es lo normal cuando el enlace se abre desde WhatsApp o desde la app instalada."
        />
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Lo que esta audiencia no se puede afirmar
        </h3>
        <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted">
          {LO_QUE_NO_SABEMOS.map((linea) => (
            <li key={linea}>· {linea}</li>
          ))}
        </ul>
      </div>
    </Seccion>
  );
}

async function DatosWeb({ dias, vista }: { dias: number; vista: Vista }) {
  const datos = await leerAnaliticasWeb(dias).catch((error: Error) => error);

  if (datos instanceof Error) {
    return (
      <Aviso>
        No se pudieron leer las analíticas del sitio: {datos.message}. Las tasas y la publicación
        no dependen de esto; vuelve a cargar la página en un momento.
      </Aviso>
    );
  }

  if (vista === "enlaces") return <BloqueEnlaces datos={datos} dias={dias} />;
  if (vista === "audiencia") return <BloqueAudiencia datos={datos} dias={dias} />;
  return <BloqueWeb datos={datos} dias={dias} />;
}

async function DatosInstagram({ dias }: { dias: number }) {
  // `leerAnaliticasInstagram` no lanza: degrada a la estructura vacía con sus
  // avisos, que es lo que la pantalla sabe mostrar métrica a métrica.
  // `compararFranjas` tampoco: devuelve `null` cuando no hay con qué opinar.
  const periodo = Math.min(dias, MAX_DIAS_INSTAGRAM);
  const [datos, actividad, crecimiento] = await Promise.all([
    leerAnaliticasInstagram(periodo),
    resumenActividad(periodo),
    crecimientoSeguidores(periodo),
  ]);

  const consejos = construirConsejos({ analiticas: datos, actividad, crecimiento, dias: periodo });

  return (
    <BloqueInstagram datos={datos} dias={dias} consejos={consejos} crecimiento={crecimiento} />
  );
}

export default async function AdminAnaliticasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; dias?: string }>;
}) {
  const params = await searchParams;
  const vista = leerVista(params.vista);
  const dias = leerDias(params.dias);

  return (
    <>
      <AdminPageHeader
        titulo="Analíticas"
        descripcion="Qué hace la gente en la calculadora y cómo le va a lo que se publica."
        aviso={<SelloDeHora iso={new Date().toISOString()} que="Lectura" />}
      />

      <Pestanas vista={vista} dias={dias} />

      <SelectorPeriodo vista={vista} dias={dias} />

      {/* Solo se pide lo que se va a mostrar. Es la razón práctica de las
          pestañas: la mitad de Instagram son cinco llamadas a la Graph API, y
          hacerlas para una pantalla que nadie va a mirar es gastar cuota y
          segundos de carga en nada. */}
      <Suspense key={`${vista}-${dias}`} fallback={<EsqueletoAnaliticas />}>
        {vista === "instagram" ? (
          <DatosInstagram dias={dias} />
        ) : (
          <DatosWeb dias={dias} vista={vista} />
        )}
      </Suspense>
    </>
  );
}
