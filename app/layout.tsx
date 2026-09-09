import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppleSplashLinks } from "@/components/AppleSplashLinks";
import { RegistroVisita } from "@/components/RegistroVisita";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { SplashOverlay } from "@/components/SplashOverlay";
import { Analytics } from "@vercel/analytics/next"
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "La Tasa — Cuánto vale tu dinero hoy",
  description:
    "Dólar BCV, dólar Binance P2P, euro BCV y peso colombiano en bolívares, con calculadora de conversiones cruzadas.",
  applicationName: "La Tasa",
  // Sin esto, en iPhone la app instalada seguiría abriendo con barra de navegador.
  appleWebApp: {
    capable: true,
    title: "La Tasa",
    statusBarStyle: "black-translucent",
  },
  /**
   * `capable` de arriba ya no basta: esta versión de Next lo traduce al meta
   * **estándar** `mobile-web-app-capable` y deja de emitir el de Apple (está
   * en su propia documentación, `node_modules/next/dist/docs/`). WebKit lee el
   * suyo, y sin él **ignora los `apple-touch-startup-image`**: la app arranca
   * en negro hasta que llega el HTML.
   *
   * Se vio en un video del arranque real: un segundo exacto de `#000000` puro
   * entre el toque y el primer pintado. Negro puro y no `#0b1120` es la firma
   * de que no se aplicó ninguna imagen nuestra — el fondo lo pone iOS, no
   * nosotros.
   *
   * Que la app abra a pantalla completa no dice nada al respecto: eso lo
   * concede el `display: standalone` del manifiesto desde iOS 15.4, por otra
   * vía. Son dos cosas distintas y solo una se rompió al deprecarse el meta.
   */
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-VE"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <AppleSplashLinks />
      <body className="min-h-full flex flex-col">
        <SplashOverlay />
        {children}
        <ServiceWorkerRegistration />
        <RegistroVisita />
      </body>
      <Analytics />
    </html>
  );
}
