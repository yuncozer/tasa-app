/** Envoltorio único de errores para todas las rutas de la API. */
export function apiError(message: string, error?: unknown, status = 502): Response {
  const detail = error instanceof Error ? error.message : undefined;
  return Response.json({ error: message, detail }, { status });
}
