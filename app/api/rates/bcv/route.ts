import { apiError, apiJson } from "@/lib/api";
import { claveApiValida } from "@/lib/api-publica";
import { getRates } from "@/lib/rates";

/** `GET /api/rates/bcv` — dólar y euro oficiales. */
export async function GET(request: Request) {
  const sinClave = claveApiValida(request);
  if (sinClave) return sinClave;

  try {
    const snapshot = await getRates();
    const { USD_BCV, EUR_BCV } = snapshot.rates;
    const status = snapshot.providers.find((provider) => provider.name === "bcv");

    if (!status?.ok) return apiError("No se pudo obtener la tasa BCV", new Error(status?.error ?? ""));

    return apiJson({
      usd: USD_BCV.bsPerUnit,
      eur: EUR_BCV.bsPerUnit,
      source: USD_BCV.source,
      updatedAt: USD_BCV.updatedAt,
    });
  } catch (error) {
    return apiError("No se pudo obtener la tasa BCV", error);
  }
}
