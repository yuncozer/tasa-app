import type { NextRequest } from "next/server";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";
import { apiError, apiJson } from "@/lib/api";
import { sugerirCifrasParada } from "@/lib/ia-textos";
import { leerParadaPendiente } from "@/lib/parada";

/**
 * Le pide a un modelo con visión que lea la pizarra de la foto del borrador y
 * devuelve lo que creyó ver, para que `/admin/parada` lo enseñe **al lado** de
 * los campos. No guarda nada y no publica nada.
 *
 * **La URL de la foto sale del borrador, no del cuerpo de la petición.** Es la
 * diferencia entre leer lo que el cron ya descargó de lanacionweb y aceptar
 * que alguien con sesión —o con una pestaña abierta— mande a nuestra cuenta de
 * IA a buscar una imagen cualquiera de internet. El mismo criterio por el que
 * `instagram-post-parada` no recibe nada por query string: lo que se dibuja, y
 * aquí lo que se lee, sale de Supabase.
 *
 * Que la respuesta se muestre y no se escriba es lo que mantiene en pie la
 * regla de que la IA no toca una cifra: `compra`/`venta` siguen arrancando
 * vacías y el botón de publicar sigue exigiendo que el admin las teclee.
 */
export const runtime = "nodejs";

/** Un modelo con visión tarda más que uno de texto; `lib/ia.ts` aborta a los 20 s. */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!esSesionValida(request.cookies.get(COOKIE_SESION)?.value)) {
    return apiError("No autorizado", undefined, 401);
  }

  const pendiente = await leerParadaPendiente().catch(() => null);
  if (!pendiente || pendiente.publicado) {
    return apiError("No hay ningún borrador de La Parada pendiente", undefined, 404);
  }
  if (!pendiente.imagenUrl) {
    return apiError("El borrador no trae foto que leer", undefined, 409);
  }

  try {
    const sugerencia = await sugerirCifrasParada(pendiente.imagenUrl);
    // Igual que `/api/admin/redactar`: que ningún modelo respondiera —o que lo
    // que devolvió no pasara la validación— no es un fallo de la petición. La
    // interfaz solo tiene que decir que no se pudo leer y que se teclee.
    return apiJson({ sugerencia });
  } catch (error) {
    return apiError("No se pudo leer la foto", error);
  }
}
