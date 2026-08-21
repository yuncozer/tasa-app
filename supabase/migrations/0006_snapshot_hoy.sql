-- El snapshot exacto con el que se publicó el carrusel de tasas del día.
--
-- `/api/og/instagram-post` y `/api/og/instagram-post-pesos` generan la imagen
-- que Instagram descarga al publicar, pero son las mismas rutas que sirven la
-- vista previa de `/hoy` — y esa se pide en cualquier momento después, cuando
-- alguien (el propio admin, o el rastreador de WhatsApp al pegar el enlace en
-- el canal) la visita. Hasta ahora esas rutas llamaban a `getRates()` en vivo
-- cada vez, así que si el dólar Binance se movía entre la publicación y esa
-- visita, la imagen mostraba un número distinto del que ya quedó escrito en
-- el caption publicado. El BCV no tiene este problema —cambia una vez al
-- día— pero Binance sí, y es justo la fila que más se nota.
--
-- Una sola fila (clave='hoy'), sobreescrita en cada disparo del cron: no es
-- histórico, es "lo último que se publicó". Por eso no comparte tabla con
-- `historico_tasas`, que sí necesita conservar mañana y tarde por separado.

create table if not exists public.snapshot_hoy (
  clave text primary key,
  snapshot jsonb not null,
  actualizado_en timestamptz not null default now()
);

-- RLS activada y sin políticas, igual que el resto de tablas de este
-- proyecto: solo la service_role, que vive únicamente en el servidor.
alter table public.snapshot_hoy enable row level security;
