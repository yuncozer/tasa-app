import type { Metadata } from "next";

/**
 * El panel se instala **aparte** de la calculadora, con su propio manifiesto.
 *
 * El problema que resuelve: con la app pública instalada en el teléfono no
 * hay barra de direcciones donde escribir `/admin`, y la calculadora no lleva
 * —ni debe llevar— ningún enlace al panel. Así que desde la app instalada no
 * había forma de llegar aquí.
 *
 * La salida no es abrir un hueco en la app pública sino declarar el admin
 * como otra aplicación instalable: se abre `latasa.online/admin` en el
 * navegador, se añade a la pantalla de inicio y queda un segundo icono que
 * entra directo al panel a pantalla completa. `scope: "/admin"` es lo que
 * mantiene las dos separadas —tocar un enlace fuera del panel abre el
 * navegador en vez de sacarte de contexto— y el icono va con la paleta
 * invertida para que los dos no se confundan en la pantalla de inicio.
 *
 * `manifest` aquí **reemplaza** al del layout raíz para todo `/admin`, login
 * incluido: si el login sirviera el manifiesto público, "Añadir a inicio"
 * desde esa pantalla crearía otro acceso a la calculadora en vez de al panel,
 * que es justo el momento en que se instala.
 *
 * En iOS el título de la app instalada sale de `appleWebApp.title`, no del
 * manifiesto, así que se declara también.
 *
 * Este layout no pinta nada: el chrome del panel (sidebar, nav, sesión) vive
 * en `app/admin/(dashboard)/layout.tsx`, que deja fuera al login a propósito.
 */
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: {
    capable: true,
    title: "La Tasa Admin",
    statusBarStyle: "black-translucent",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
