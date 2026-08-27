"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { registrarEvento } from "@/lib/analitica-cliente";

/**
 * Anota una visita por cada ruta que se abre.
 *
 * Va en el layout raíz y no en cada página porque las navegaciones internas de
 * Next no recargan nada: sin escuchar el `pathname`, ir de la calculadora al
 * historial no contaría como visita.
 *
 * **`/admin` no se registra.** El panel lo usa una sola persona, varias veces
 * al día, y contarlo inflaría justo las cifras que se miran para decidir si la
 * app le sirve a alguien más.
 */
export function RegistroVisita() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    registrarEvento("visita");
  }, [pathname]);

  return null;
}
