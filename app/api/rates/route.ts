import { clearCache } from "@/lib/cache";
import { getRates } from "@/lib/rates";
import { apiError, apiJson } from "@/lib/api";
import type { NextRequest } from "next/server";

/** `GET /api/rates` — todas las tasas del día. `?refresh=1` ignora la caché. */
export async function GET(request: NextRequest) {
  try {
    const forzar = request.nextUrl.searchParams.get("refresh") === "1";
    if (forzar) clearCache();

    // Una petición que pide datos frescos a propósito no debe quedar guardada en
    // la CDN: si no, la siguiente recibiría lo mismo sin consultar nada.
    return apiJson(await getRates(), { cachear: !forzar });
  } catch (error) {
    return apiError("No se pudieron obtener las tasas", error);
  }
}
