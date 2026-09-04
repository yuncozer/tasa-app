/**
 * Service worker de La Tasa.
 *
 * Escrito a mano y sin librería: la app es una sola página con sus estáticos, y
 * la alternativa que recomienda Next (Serwist) exige configuración de webpack,
 * mientras que este proyecto va con Turbopack.
 *
 * La idea es que, sin señal, la app siga abriendo con las últimas tasas vistas.
 * La interfaz avisa de que son viejas; aquí lo importante es no servir nunca una
 * respuesta de `/api/` desde la caché, porque ahí sí pasaría por fresca.
 */

const VERSION = "v9";
const ATAJOS = ["/hoy", "/laparada", "/ig", "/wa"];
const CACHE_PAGINA = `latasa-pagina-${VERSION}`;
const CACHE_ESTATICOS = `latasa-estaticos-${VERSION}`;
const VIGENTES = [CACHE_PAGINA, CACHE_ESTATICOS];
/** Prefijos de cachés de versiones previas (incluida la de "Tasapp"), para poder limpiarlas. */
const PREFIJOS_VIEJOS = ["tasapp-", "latasa-"];

/** Clave única para la portada: así `?actualizar=…` no llena la caché. */
const CLAVE_PORTADA = "/";

/**
 * Bajo qué clave se guarda una navegación: **su ruta, sin la query**.
 *
 * Las dos mitades importan. Que sea la ruta y no una clave fija es lo que
 * impide que visitar otra página sobreescriba la copia de la portada: con
 * `CLAVE_PORTADA` para todo, abrir `/historial` con señal dejaba su HTML
 * guardado como si fuera la portada, y sin conexión la app abría en el
 * historial en vez de en la calculadora.
 *
 * Y que se descarte la query es la razón original de `CLAVE_PORTADA`: sin eso,
 * cada `?actualizar=<marca>` —que cambia en cada pulsación del botón— dejaría
 * una entrada nueva y la caché crecería sin fin. El costo asumido es que
 * `/historial?vista=bs` y `?vista=cop` comparten copia, así que sin conexión se
 * ve la última visitada; es el mismo criterio que ya se aplicaba a la portada.
 */
function claveDeNavegacion(request) {
  return new URL(request.url).pathname;
}

/**
 * Guarda la portada y sus estáticos durante la instalación.
 *
 * Sin esto la app no abría sin conexión: en la primera visita el service worker
 * todavía no gobierna las peticiones, así que la navegación que la trae no pasa
 * por él y no se guarda nada. Haría falta una segunda visita con datos para
 * dejar copia, y quien instala la app y se queda sin señal se encuentra la
 * pantalla en blanco.
 *
 * Los nombres de los archivos de Next llevan un hash que cambia en cada
 * compilación, así que en vez de una lista fija se leen del propio HTML.
 */
async function precargar() {
  const respuesta = await fetch(CLAVE_PORTADA, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`La portada respondió ${respuesta.status}`);

  const html = await respuesta.clone().text();
  const cachePagina = await caches.open(CACHE_PAGINA);
  await cachePagina.put(CLAVE_PORTADA, respuesta);

  const rutas = [...new Set([...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
  const cacheEstaticos = await caches.open(CACHE_ESTATICOS);

  // Uno a uno y sin cortar por un fallo: mejor guardar de más que quedarse sin
  // nada porque un solo archivo no respondió.
  await Promise.allSettled(
    rutas.map(async (ruta) => {
      const recurso = await fetch(ruta);
      if (recurso.ok) await cacheEstaticos.put(ruta, recurso);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Si la instalación ocurre sin red, no se aborta: ya se guardará copia en
      // la primera navegación que sí llegue.
      await precargar().catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Una versión nueva no debe quedar atrapada tras un service worker viejo:
      // son tasas, y la app tiene que poder corregirse el mismo día.
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter(
            (nombre) =>
              PREFIJOS_VIEJOS.some((prefijo) => nombre.startsWith(prefijo)) &&
              !VIGENTES.includes(nombre),
          )
          .map((nombre) => caches.delete(nombre)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Último recurso: mejor explicar qué pasa que dejar la pantalla en blanco. */
function paginaDeCortesia() {
  return new Response(
    `<!doctype html><html lang="es-VE"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>La Tasa · sin conexión</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1120;color:#f1f5f9;font-family:system-ui,sans-serif;text-align:center;padding:2rem}
p{color:#94a3b8;line-height:1.5;max-width:22rem}</style></head>
<body><div><h1>Sin conexión</h1>
<p>Todavía no hay tasas guardadas en este dispositivo. Abre La Tasa una vez con datos
y a partir de entonces funcionará también sin señal.</p></div></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/**
 * Red primero: si responde, se guarda copia; si no, se sirve la última buena.
 *
 * Sin conexión se busca primero la copia de **esa misma ruta** y solo después
 * se cae a la portada: así `/historial` offline muestra el historial que se vio
 * la última vez —cada fila lleva su fecha a la vista, de modo que no hay riesgo
 * de hacer pasar un dato viejo por fresco— y, sobre todo, abrir la app en `/`
 * sigue mostrando la calculadora aunque antes se haya visitado otra página.
 */
async function navegacion(request) {
  const cache = await caches.open(CACHE_PAGINA);
  const clave = claveDeNavegacion(request);

  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) await cache.put(clave, respuesta.clone());
    return respuesta;
  } catch {
    const guardada = (await cache.match(clave)) ?? (await cache.match(CLAVE_PORTADA));
    return guardada ?? paginaDeCortesia();
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

  // Los atajos del dominio los resuelve el servidor: a dónde llevan cambia
  // cada pocas horas, y la copia guardada de la portada no lo sabe. Sin esto
  // /hoy mostraría la portada en vez de abrir el post del día. `/p/` es la
  // misma idea pero con un slug por post en vez de una ruta fija, así que se
  // deja pasar por prefijo.
  // `/e/` y `/p/` van por prefijo y no por ruta exacta como el resto de
  // ATAJOS, porque cada post tiene su propio slug. `/p/` es la forma anterior
  // de `/e/`, que sigue viva en captions ya publicados y redirige aquí.
  if (ATAJOS.includes(url.pathname) || url.pathname.startsWith("/e/") || url.pathname.startsWith("/p/"))
    return;

  // El panel no se cachea nunca, ni su HTML ni sus navegaciones. Tres motivos
  // que apuntan al mismo sitio: sus pantallas muestran estado del momento
  // (cola de publicaciones, borradores, analíticas) y una copia vieja se
  // leería como el estado de ahora; al cerrar sesión, la copia guardada
  // seguiría pintando el panel; y sin conexión no hay nada que hacer aquí,
  // porque publicar necesita red de todas formas. Es la misma regla que ya
  // rige `/api/`, aplicada a las pantallas que solo tienen sentido en vivo.
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navegacion(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(estatico(request));
  }
});
