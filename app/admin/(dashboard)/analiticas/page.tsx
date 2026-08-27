import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BarrasDias } from "@/components/admin/BarrasDias";
import { ListaConteo } from "@/components/admin/ListaConteo";
import { TarjetaMetrica } from "@/components/admin/TarjetaMetrica";
import { leerAnaliticasWeb, type AnaliticasWeb } from "@/lib/analiticas-web";
import { formatEntero, formatFechaCorta, formatPercent } from "@/lib/format";
import { leerAnaliticasInstagram, type AnaliticasInstagram } from "@/lib/instagram-insights";
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
 * El período viaja por query string (`?dias=`) y no en estado de cliente: la
 * página ya se renderiza en el servidor y un enlace normal resuelve el caso
 * sin JavaScript, igual que el `?vista=` de `/historial`.
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

function leerDias(valor: string | undefined): number {
  const dias = Number(valor);
  return PERIODOS.includes(dias as (typeof PERIODOS)[number]) ? dias : POR_DEFECTO;
}

function SelectorPeriodo({ dias }: { dias: number }) {
  return (
    <nav aria-label="Período" className="flex gap-2">
      {PERIODOS.map((opcion) => {
        const activo = opcion === dias;
        return (
          <Link
            key={opcion}
            href={`/admin/analiticas?dias=${opcion}`}
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
    <Seccion titulo={`Calculadora · últimos ${dias} días`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaMetrica etiqueta="Sesiones" valor={totales.sesiones} apoyo="Pestañas distintas" />
        <TarjetaMetrica etiqueta="Visitas" valor={totales.visitas} apoyo="Pantallas abiertas" />
        <TarjetaMetrica
          etiqueta="Conversiones"
          valor={totales.conversiones}
          apoyo={
            tasaConversion === null
              ? undefined
              : `${formatPercent(tasaConversion)} de las sesiones`
          }
        />
        <TarjetaMetrica
          etiqueta="Cifras copiadas"
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
          etiqueta="Sesiones desde la app instalada"
          valor={totales.sesionesInstaladas}
          apoyo={`${formatEntero(totales.instalaciones)} instalaciones nuevas`}
        />
        <TarjetaMetrica
          etiqueta="Sesiones sin conexión"
          valor={totales.sesionesSinConexion}
          apoyo="Llegaron a usarla sin señal"
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

function BloqueInstagram({ datos, dias }: { datos: AnaliticasInstagram; dias: number }) {
  const periodo = Math.min(dias, MAX_DIAS_INSTAGRAM);

  return (
    <Seccion titulo={`Instagram · últimos ${periodo} días`}>
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
          valor={datos.perfil.seguidores}
          apoyo={datos.perfil.username ? `@${datos.perfil.username}` : undefined}
        />
        <TarjetaMetrica etiqueta="Alcance" valor={datos.totales.reach} apoyo="Cuentas distintas" />
        <TarjetaMetrica
          etiqueta="Interacciones"
          valor={datos.totales.total_interactions}
          apoyo="Me gusta, comentarios y guardados"
        />
        <TarjetaMetrica etiqueta="Visitas al perfil" valor={datos.totales.profile_views} />
      </div>

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

export default async function AdminAnaliticasPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const dias = leerDias((await searchParams).dias);

  const [web, instagram] = await Promise.all([
    leerAnaliticasWeb(dias).catch((error: Error) => error),
    leerAnaliticasInstagram(Math.min(dias, MAX_DIAS_INSTAGRAM)),
  ]);

  return (
    <>
      <AdminPageHeader
        titulo="Analíticas"
        descripcion="Qué hace la gente en la calculadora y cómo le va a lo que se publica."
      />

      <SelectorPeriodo dias={dias} />

      <div className="flex flex-col gap-8">
        {web instanceof Error ? (
          <Aviso>No se pudieron leer las analíticas del sitio: {web.message}</Aviso>
        ) : (
          <BloqueWeb datos={web} dias={dias} />
        )}

        <BloqueInstagram datos={instagram} dias={dias} />
      </div>
    </>
  );
}
