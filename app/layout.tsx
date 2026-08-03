import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppleSplashLinks } from "@/components/AppleSplashLinks";
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
  title: "La Tasa — Tasas y calculadora de la frontera",
  description:
    "Dólar BCV, dólar Binance P2P, euro BCV y peso colombiano en bolívares, con calculadora de conversiones cruzadas.",
  applicationName: "La Tasa",
  // Sin esto, en iPhone la app instalada seguiría abriendo con barra de navegador.
  appleWebApp: {
    capable: true,
    title: "La Tasa",
    statusBarStyle: "black-translucent",
  },
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
      </body>
      <Analytics />
    </html>
  );
}
