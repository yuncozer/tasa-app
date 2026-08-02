import { apiError, apiJson } from "@/lib/api";
import { getRates } from "@/lib/rates";

/**
 * `GET /api/rates/binance` — mercado P2P con su compra y su venta.
 *
 * Devuelve las dos monedas: `ves` es el dólar paralelo venezolano y `cop` el
 * precio real del peso, que es la otra pata de la tasa de frontera.
 */
export async function GET() {
  try {
    const snapshot = await getRates();
    if (!snapshot.binance.ves && !snapshot.binance.cop) {
      const status = snapshot.providers.find((provider) => provider.name === "binance-ves");
      return apiError("No se pudo obtener la tasa Binance P2P", new Error(status?.error ?? ""));
    }

    return apiJson({
      ves: snapshot.binance.ves,
      cop: snapshot.binance.cop,
      source: "Binance P2P",
      updatedAt: snapshot.fetchedAt,
    });
  } catch (error) {
    return apiError("No se pudo obtener la tasa Binance P2P", error);
  }
}
