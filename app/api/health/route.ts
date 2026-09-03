import { apiError } from "@/lib/api";
import { getRates } from "@/lib/rates";

/**
 * `GET /api/health` — estado de cada proveedor externo.
 *
 * Es una ruta pública, así que dice **si** un proveedor responde y qué
 * degradación tiene, nunca por qué falló. `ProviderStatus.error` es el texto
 * de la excepción —la URL que no resolvió, el cuerpo con el que contestó
 * Supabase, lo que la librería tuviera que decir— y publicarlo era un mapa
 * gratuito de cómo está montado esto por dentro, actualizado en vivo y sin
 * pedirle a nadie una contraseña.
 *
 * `warning` sí se conserva: ese texto lo escribimos nosotros, es de conjunto
 * cerrado y es justo lo que hace útil a esta ruta —"la TRM viene del respaldo
 * internacional" explica una cifra rara sin explicar la infraestructura—.
 *
 * El diagnóstico completo, con el error entero, sigue estando en `/admin`,
 * que es donde hay una sesión de por medio.
 */
export async function GET() {
  try {
    const snapshot = await getRates();
    const healthy = snapshot.providers.every((provider) => provider.ok);

    const providers = snapshot.providers.map(({ name, ok, source, warning }) => ({
      name,
      ok,
      source,
      ...(warning ? { warning } : {}),
    }));

    return Response.json(
      { status: healthy ? "ok" : "degraded", fetchedAt: snapshot.fetchedAt, providers },
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
