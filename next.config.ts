import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // La portada es donde de verdad llega el tráfico, y Next la marca como
        // dinámica —los proveedores se consultan con `no-store`—, así que sin
        // esto cada visita despertaría una función y repetiría la ronda de
        // llamadas al BCV, a Binance y a datos.gov.co.
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        // Sin estas cabeceras el navegador puede quedarse con un service worker
        // antiguo y la app dejaría de actualizarse sola.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
