import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * La pantalla de "esta dirección no existe".
 *
 * Hasta ahora una URL equivocada caía en la página por defecto de Next: fondo
 * blanco, tipografía del sistema y un "404 | This page could not be found" en
 * inglés. En una app que se abre desde un enlace pegado en WhatsApp eso se lee
 * como "el sitio se rompió", y encima parece otro sitio distinto — todo lo
 * contrario de lo que hace falta cuando alguien llega con un enlace mal
 * copiado.
 *
 * Lo importante no es el 404 sino la salida: el enlace grande a la
 * calculadora, que es a lo que venía el 99 % de quien llega aquí. `/historial`
 * va debajo porque es el otro destino que alguien puede estar buscando.
 *
 * Es una página estática y sin JavaScript, así que también funciona servida
 * por el service worker sin conexión.
 */
export const metadata: Metadata = {
  title: "Página no encontrada — La Tasa",
};

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center sm:px-6">
      <Logo className="h-12 w-12 text-accent" />

      <div className="flex flex-col gap-2">
        <p className="tabular text-3xl font-bold leading-none tracking-tight">404</p>
        <h1 className="text-base font-semibold">Esta dirección no existe</h1>
        <p className="text-sm text-muted">
          Puede que el enlace esté incompleto o que la página haya cambiado de sitio.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-background transition active:scale-95"
        >
          Ir a la calculadora
        </Link>
        <Link
          href="/historial"
          className="rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted transition active:scale-95"
        >
          Ver el historial de tasas
        </Link>
      </div>
    </main>
  );
}
