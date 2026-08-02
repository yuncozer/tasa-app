import { clearCache } from "@/lib/cache";
import { getRates } from "@/lib/rates";
import { apiError } from "@/lib/api";
import type { NextRequest } from "next/server";

/** `GET /api/rates` — todas las tasas del día. `?refresh=1` ignora la caché. */
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("refresh") === "1") clearCache();
    return Response.json(await getRates());
  } catch (error) {
    return apiError("No se pudieron obtener las tasas", error);
  }
}
