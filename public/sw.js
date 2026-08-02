/**
 * Service worker de Tasapp.
 *
 * Escrito a mano y sin librería: la app es una sola página con sus estáticos, y
 * la alternativa que recomienda Next (Serwist) exige configuración de webpack,
 * mientras que este proyecto va con Turbopack.
 *
 * La idea es que, sin señal, la app siga abriendo con las últimas tasas vistas.
 * La interfaz avisa de que son viejas; aquí lo importante es no servir nunca una
 * respuesta de `/api/` desde la caché, porque ahí sí pasaría por fresca.
 */

const VERSION = "v1";
const CACHE_PAGINA = `tasapp-pagina-${VERSION}`;
const CACHE_ESTATICOS = `tasapp-estaticos-${VERSION}`;
const VIGENTES = [CACHE_PAGINA, CACHE_ESTATICOS];

/** Clave única para la portada: así `?actualizar=…` no llena la caché. */
const CLAVE_PORTADA = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Una versión nueva no debe quedar atrapada tras un service worker viejo:
      // son tasas, y la app tiene que poder corregirse el mismo día.
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith("tasapp-") && !VIGENTES.includes(nombre))
          .map((nombre) => caches.delete(nombre)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Red primero: si responde, se guarda copia; si no, se sirve la última buena. */
async function portada(request) {
  const cache = await caches.open(CACHE_PAGINA);

  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) await cache.put(CLAVE_PORTADA, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(CLAVE_PORTADA);
    if (guardada) return guardada;
    throw error;
  }
}

/** Caché primero y revalidación en segundo plano: los estáticos son inmutables. */
async function estatico(request) {
  const cache = await caches.open(CACHE_ESTATICOS);
  const guardado = await cache.match(request);

  const red = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(request, respuesta.clone());
      return respuesta;
    })
    .catch(() => guardado);

  return guardado ?? red;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Las tasas nunca se sirven de caché: una tasa vieja que parece fresca es
  // justo el daño que esta app debe evitar.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(portada(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(estatico(request));
  }
});
