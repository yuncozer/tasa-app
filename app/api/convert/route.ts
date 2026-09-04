import { apiError } from "@/lib/api";
import { claveApiValida } from "@/lib/api-publica";
import { convert, isRateKey } from "@/lib/convert";
import { getRates, RATE_ORDER } from "@/lib/rates";

/**
 * `POST /api/convert` con `{ "amount": 100, "from": "USD_BCV" }`.
 *
 * Devuelve el equivalente del monto en todas las bases. Es el contrato REST
 * público; la calculadora del navegador hace el mismo cálculo en local para
 * responder al instante mientras se teclea.
 */
export async function POST(request: Request) {
  const sinClave = claveApiValida(request);
  if (sinClave) return sinClave;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("El cuerpo de la petición no es JSON válido", undefined, 400);
  }

  const { amount, from } = (body ?? {}) as { amount?: unknown; from?: unknown };

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return apiError("El campo 'amount' debe ser un número mayor o igual a 0", undefined, 400);
  }
  if (!isRateKey(from)) {
    return apiError(`El campo 'from' debe ser uno de: ${RATE_ORDER.join(", ")}`, undefined, 400);
  }

  try {
    const snapshot = await getRates();
    const conversion = convert(amount, from, snapshot);

    return Response.json({ ...conversion, fetchedAt: snapshot.fetchedAt });
  } catch (error) {
    return apiError("No se pudo realizar la conversión", error);
  }
}
