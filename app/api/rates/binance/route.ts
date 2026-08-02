import { apiError } from "@/lib/api";
import { getRates } from "@/lib/rates";

/** `GET /api/rates/binance` — dólar P2P con su compra y su venta. */
export async function GET() {
  try {
    const snapshot = await getRates();
    if (!snapshot.binance) {
      const status = snapshot.providers.find((provider) => provider.name === "binance");
      return apiError("No se pudo obtener la tasa Binance P2P", new Error(status?.error ?? ""));
    }

    return Response.json({
      ...snapshot.binance,
      source: snapshot.rates.USD_BINANCE.source,
      updatedAt: snapshot.rates.USD_BINANCE.updatedAt,
    });
  } catch (error) {
    return apiError("No se pudo obtener la tasa Binance P2P", error);
  }
}
