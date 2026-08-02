"use client";

import { useEffect } from "react";

/**
 * Registra el service worker que permite abrir la app sin conexión.
 *
 * Solo en producción: en desarrollo una caché de por medio esconde los cambios y
 * confunde más de lo que ayuda.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Se espera a `load` para no competir con la carga de la propia página.
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("No se pudo registrar el service worker", error);
      });
    };

    if (document.readyState === "complete") {
      registrar();
      return;
    }

    window.addEventListener("load", registrar);
    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
