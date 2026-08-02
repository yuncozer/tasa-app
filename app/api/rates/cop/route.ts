import { apiError } from "@/lib/api";
import { getRates } from "@/lib/rates";

/** `GET /api/rates/cop` — peso colombiano: pesos por dólar y sus dos cruces en Bs. */
export async function GET() {
  try {
    const snapshot = await getRates();
    if (snapshot.usdCop === null) {
      const status = snapshot.providers.find((provider) => provider.name === "cop");
      return apiError("No se pudo obtener la tasa del peso", new Error(status?.error ?? ""));
    }

    return Response.json({
      usdCop: snapshot.usdCop,
      bsPerCopBcv: snapshot.rates.COP_BCV.bsPerUnit,
      bsPerCopBinance: snapshot.rates.COP_BINANCE.bsPerUnit,
      source: snapshot.rates.COP_BCV.source,
      updatedAt: snapshot.rates.COP_BCV.updatedAt,
    });
  } catch (error) {
    return apiError("No se pudo obtener la tasa del peso", error);
  }
}
