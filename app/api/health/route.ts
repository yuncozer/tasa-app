import { apiError } from "@/lib/api";
import { getRates } from "@/lib/rates";

/** `GET /api/health` — estado de cada proveedor externo. */
export async function GET() {
  try {
    const snapshot = await getRates();
    const healthy = snapshot.providers.every((provider) => provider.ok);

    return Response.json(
      { status: healthy ? "ok" : "degraded", fetchedAt: snapshot.fetchedAt, providers: snapshot.providers },
      {
        status: healthy ? 200 : 207,
        // Un diagnóstico cacheado no sirve: hay que poder ver el estado de ahora.
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError("No se pudo consultar el estado de los proveedores", error, 503);
  }
}
