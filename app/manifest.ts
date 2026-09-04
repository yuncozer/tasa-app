import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA. Next lo sirve en `/manifest.webmanifest` e inserta el
 * `<link rel="manifest">` por su cuenta.
 *
 * Los colores son los mismos del tema: así la pantalla de arranque no da un
 * fogonazo blanco antes de cargar la app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Tasa — Cuánto vale tu dinero hoy",
    short_name: "La Tasa",
    description:
      "Dólar BCV, dólar Binance P2P, euro BCV y peso colombiano en bolívares, con calculadora de conversiones cruzadas.",
    lang: "es-VE",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1120",
    theme_color: "#0b1120",
    categories: ["finance", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
