import { apiError } from "@/lib/api";
import { getRates } from "@/lib/rates";

/**
 * `GET /api/rates/cop` — peso colombiano.
 *
 * `trm` es el dólar oficial de Colombia y `copMercado` el del P2P; de ahí salen
 * los dos precios del peso en bolívares: el de papel y el de la frontera.
 */
export async function GET() {
  try {
    const snapshot = await getRates();
    if (snapshot.trm === null && snapshot.copMercado === null) {
      const status = snapshot.providers.find((provider) => provider.name === "trm");
      return apiError("No se pudo obtener la tasa del peso", new Error(status?.error ?? ""));
    }

    return Response.json({
      trm: snapshot.trm,
      copMercado: snapshot.copMercado,
      bsPorPesoOficial: snapshot.rates.COP_OFICIAL.bsPerUnit,
      bsPorPesoFrontera: snapshot.rates.COP_FRONTERA.bsPerUnit,
      source: snapshot.rates.COP_OFICIAL.source,
      updatedAt: snapshot.rates.COP_OFICIAL.updatedAt,
    });
  } catch (error) {
    return apiError("No se pudo obtener la tasa del peso", error);
  }
}
