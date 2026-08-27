import {
  Activity,
  BarChart3,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Newspaper,
  Send,
  TrendingUp,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Única fuente de verdad de la navegación de `/admin`: qué páginas hay, en
 * qué orden, con qué ícono y bajo qué grupo. La consumen `AdminShell` (la
 * nav de verdad) y `app/admin/(dashboard)/page.tsx` (las tarjetas del
 * dashboard), así que un enlace nuevo se agrega una sola vez.
 *
 * `grupo` no es decorativo: separa "lo que se dispara" de "lo que se
 * consulta", que es como el admin piensa el panel — no hay un criterio de
 * alfabetización o de fecha de creación detrás.
 */

export interface EnlaceAdmin {
  href: string;
  label: string;
  descripcion: string;
  icon: LucideIcon;
}

export interface GrupoAdmin {
  id: string;
  titulo: string;
  enlaces: EnlaceAdmin[];
}

export const NAV_ADMIN: GrupoAdmin[] = [
  {
    id: "publicar",
    titulo: "Publicar",
    enlaces: [
      {
        href: "/admin/hoy",
        label: "Publicar tasas",
        descripcion: "Dispara el carrusel del día fuera del horario del cron.",
        icon: Send,
      },
      {
        href: "/admin/parada",
        label: "La Parada",
        descripcion: "Revisa y publica el borrador que detecta el cron.",
        icon: MapPin,
      },
      {
        href: "/admin/noticia",
        label: "Noticias",
        descripcion: "Artículo externo o contenido propio, en post, carrusel o Reel.",
        icon: Newspaper,
      },
    ],
  },
  {
    id: "reportes",
    titulo: "Reportes y difusión",
    enlaces: [
      {
        href: "/admin/semanal",
        label: "Semanal",
        descripcion: "Cómo se movieron las tasas en los últimos 7 días.",
        icon: BarChart3,
      },
      {
        href: "/admin/brecha",
        label: "Brecha",
        descripcion: "Alerta suelta cuando la distancia entre el BCV y Binance se mueve.",
        icon: TrendingUp,
      },
      {
        href: "/admin/canal",
        label: "Canal",
        descripcion: "Arma el mensaje de WhatsApp a partir de un post ya publicado.",
        icon: MessageCircle,
      },
    ],
  },
  {
    id: "herramientas",
    titulo: "Herramientas",
    enlaces: [
      {
        href: "/admin/video",
        label: "Videos",
        descripcion: "El Reel de tasas del día, con el copy del último post.",
        icon: Video,
      },
    ],
  },
];

export const ENLACE_INICIO: EnlaceAdmin = {
  href: "/admin",
  label: "Inicio",
  descripcion: "Vista general del panel.",
  icon: LayoutDashboard,
};

export const ENLACE_ANALITICAS: EnlaceAdmin = {
  href: "/admin/analiticas",
  label: "Analíticas",
  descripcion: "Uso de la calculadora y rendimiento de lo publicado en Instagram.",
  icon: Activity,
};

/**
 * Los dos enlaces que van sueltos arriba, antes de los grupos.
 *
 * No están en ningún grupo porque no comparten su criterio: "Publicar",
 * "Reportes y difusión" y "Herramientas" son cosas que se **disparan** sobre
 * una sección concreta, y estas dos son la mirada de conjunto —dónde está el
 * panel y cómo va lo que ya salió—. Puestas dentro de un grupo quedaban a
 * media lista, que es donde no se busca un panorama.
 */
export const ENLACES_SUPERIORES: EnlaceAdmin[] = [ENLACE_INICIO, ENLACE_ANALITICAS];

/** Los enlaces de los grupos, en un único arreglo plano y en orden. */
export const ENLACES_ADMIN: EnlaceAdmin[] = NAV_ADMIN.flatMap((grupo) => grupo.enlaces);
