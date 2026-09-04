import { getRates, pedirTasasFrescas } from "@/lib/rates";
import { apiError, apiJson } from "@/lib/api";
import { claveApiValida } from "@/lib/api-publica";
import type { NextRequest } from "next/server";

/**
 * `GET /api/rates` — todas las tasas del día.
 *
 * `?refresh=1` pide saltarse la caché en memoria. **No la vacía entera ni
 * fuerza una ronda por petición**: antes llamaba a `clearCache()`, que
 * limpiaba el Map completo —incluidos el token de Instagram y la tarjeta de
 * La Parada— y estaba abierto a cualquiera, así que un bucle desde fuera
 * bastaba para golpear al BCV, a Binance y a datos.gov.co sin parar y
 * arriesgar que la fuente nos bloquee. Ahora pasa por `pedirTasasFrescas()`,
 * que solo tira las tasas y solo si ya tienen unos segundos.
 */
export async function GET(request: NextRequest) {
  const sinClave = claveApiValida(request);
  if (sinClave) return sinClave;

  try {
    const forzar = request.nextUrl.searchParams.get("refresh") === "1";
    if (forzar) pedirTasasFrescas();

    // Una petición que pide datos frescos a propósito no debe quedar guardada en
    // la CDN: si no, la siguiente recibiría lo mismo sin consultar nada.
    return apiJson(await getRates());
  } catch (error) {
    return apiError("No se pudieron obtener las tasas", error);
  }
}
