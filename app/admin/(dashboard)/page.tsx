import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AgendaDelDia } from "@/components/admin/AgendaDelDia";
import { EstadoToken } from "@/components/admin/EstadoToken";
import { construirAgendaHoy } from "@/lib/agenda-hoy";
import { ENLACE_ANALITICAS, NAV_ADMIN, type EnlaceAdmin } from "@/components/admin/nav-admin";
import { DIAS_PARA_AVISAR, estadoToken } from "@/lib/instagram-token";
import { leerParadaPendiente } from "@/lib/parada";
import { listarProgramadas } from "@/lib/programadas";
import { getRates } from "@/lib/rates";

export const metadata: Metadata = {
  title: "Admin — La Tasa",
};

/**
 * El dashboard no puede ser una lista estática de enlaces si va a sentirse
 * como un gestor de contenido de verdad: cada tarjeta trae, cuando hay algo
 * real que decir, una insignia de estado — "2 en cola", "Hay un borrador sin
 * publicar" — para que abrir `/admin` ya diga qué necesita atención antes de
 * entrar a cada sección. Donde no hay estado que consultar (Semanal, Canal,
 * Videos son "se mira y se dispara", no colas) la tarjeta se queda simple.
 *
 * Cada fuente de estado se envuelve en su propio `try/catch`: un Supabase
 * caído no puede tumbar el panel entero, solo dejar sin insignia a la
 * tarjeta que dependía de él — mismo criterio que ya usa cada página por
 * separado.
 */
async function contarPendientesNoticia(): Promise<number | null> {
  try {
    const programadas = await listarProgramadas();
    return programadas.length;
  } catch {
    return null;
  }
}

async function hayParadaPendiente(): Promise<boolean | null> {
  try {
    const borrador = await leerParadaPendiente();
    return Boolean(borrador && !borrador.publicado);
  } catch {
    return null;
  }
}

async function hayDegradacion(): Promise<boolean | null> {
  try {
    const snapshot = await getRates();
    return snapshot.providers.some((provider) => !provider.ok || provider.warning);
  } catch {
    return null;
  }
}

/**
 * El token de Instagram caduca a los 60 días y, cuando lo hace, no se rompe
 * nada visible: el cron simplemente deja de publicar. El cron diario lo
 * renueva solo (`app/api/cron/refrescar-token-ig`), así que aquí se resuelven
 * dos cosas distintas con la misma lectura: **el aviso**, que solo existe
 * cuando hay algo que hacer y va arriba en ámbar, y **la cuenta atrás**, que
 * va siempre —discreta, al pie— porque "¿cuánto le queda?" es una pregunta
 * legítima aunque la respuesta sea tranquilizadora.
 */
async function leerToken(): Promise<
  { diasRestantes: number | null; refrescadoEn: string | null; aviso: string | null } | null
> {
  try {
    const { diasRestantes, refrescadoEn } = await estadoToken();

    const aviso =
      diasRestantes === null
        ? "El token de Instagram todavía no está registrado: se publica con el del entorno y no hay forma de saber cuándo caduca. Renuévalo una vez para empezar a contar."
        : diasRestantes <= 0
          ? "El token de Instagram caducó. Nada se publicará hasta renovarlo."
          : diasRestantes <= DIAS_PARA_AVISAR
            ? `El token de Instagram caduca en ${diasRestantes} ${diasRestantes === 1 ? "día" : "días"} y el cron de renovación no lo ha refrescado.`
            : null;

    return { diasRestantes, refrescadoEn, aviso };
  } catch {
    // Sin Supabase no hay nada que contar: la publicación sigue con el token
    // del entorno, igual que antes de que esta vigilancia existiera.
    return null;
  }
}

function Insignia({ tono, children }: { tono: "accent" | "warning"; children: React.ReactNode }) {
  const clase =
    tono === "warning"
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-accent/40 bg-accent/10 text-accent";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${clase}`}>
      {children}
    </span>
  );
}

function TarjetaSeccion({ enlace, insignia }: { enlace: EnlaceAdmin; insignia?: React.ReactNode }) {
  const Icon = enlace.icon;
  return (
    <Link
      href={enlace.href}
      className="flex items-start gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-4 transition active:scale-[0.98]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{enlace.label}</h2>
          {insignia}
        </div>
        <p className="text-sm text-muted">{enlace.descripcion}</p>
      </div>
    </Link>
  );
}

export default async function AdminPage() {
  const [pendientesNoticia, paradaPendiente, degradado, token, agenda] = await Promise.all([
    contarPendientesNoticia(),
    hayParadaPendiente(),
    hayDegradacion(),
    leerToken(),
    construirAgendaHoy(),
  ]);

  const insignias: Partial<Record<string, React.ReactNode>> = {
    "/admin/hoy": degradado ? <Insignia tono="warning">Degradado</Insignia> : null,
    "/admin/parada": paradaPendiente ? <Insignia tono="warning">Borrador sin publicar</Insignia> : null,
    "/admin/noticia":
      pendientesNoticia !== null && pendientesNoticia > 0 ? (
        <Insignia tono="accent">
          {pendientesNoticia} en cola
        </Insignia>
      ) : null,
  };

  return (
    <>
      <AdminPageHeader
        titulo="Panel de La Tasa"
        descripcion="Publicar contenido, revisar borradores pendientes y armar reportes."
        aviso={
          token?.aviso ? (
            <EstadoToken
              mensaje={token.aviso}
              diasRestantes={token.diasRestantes}
              refrescadoEn={token.refrescadoEn}
            />
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        {/* La agenda va antes que las secciones porque responde la pregunta
            con la que se abre el panel —"¿está todo bien?"— y las secciones
            responden la siguiente: "¿dónde lo arreglo?". */}
        <AgendaDelDia agenda={agenda} />

        {/* Analíticas va suelta y primero, fuera de los grupos, igual que en
            la sidebar: es la mirada de conjunto sobre lo que ya salió, no una
            acción que se dispare sobre una sección. */}
        <TarjetaSeccion enlace={ENLACE_ANALITICAS} />

        {NAV_ADMIN.map((grupo) => (
          <section key={grupo.id} aria-labelledby={`grupo-${grupo.id}`} className="flex flex-col gap-3">
            <h2
              id={`grupo-${grupo.id}`}
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              {grupo.titulo}
            </h2>
            <div className="flex flex-col gap-3">
              {grupo.enlaces.map((enlace) => (
                <TarjetaSeccion key={enlace.href} enlace={enlace} insignia={insignias[enlace.href]} />
              ))}
            </div>
          </section>
        ))}

        {/* La cuenta atrás del token, al pie y en gris: es una referencia que
            se consulta, no algo que deba competir con las secciones. Cuando
            de verdad hay que actuar, el mismo componente sale arriba en
            ámbar y con el botón. */}
        {token && !token.aviso && (
          <EstadoToken diasRestantes={token.diasRestantes} refrescadoEn={token.refrescadoEn} />
        )}
      </div>
    </>
  );
}
