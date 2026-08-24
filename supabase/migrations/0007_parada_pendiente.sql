-- Borrador detectado del post diario "Dólar en La Parada" (lanacionweb.com),
-- listo para revisar y publicar desde /admin/parada.
--
-- lanacionweb no publica ese artículo a una hora fija, así que un cron
-- (`app/api/cron/vigilar-parada/route.ts`) revisa su categoría "Frontera"
-- cada cierto tiempo. No publica solo: el cuerpo del artículo se extrae con
-- una expresión regular sobre prosa libre que ellos redactan a mano cada día,
-- y un cambio de redacción puede colar un número equivocado bajo la marca de
-- La Tasa. Por eso el cron solo prepara el borrador (título, imagen, caption
-- sugerido) y un humano lo publica con un toque.
--
-- Una sola fila (clave='parada'), sobreescrita cada vez que se detecta un
-- artículo nuevo — mismo patrón que `snapshot_hoy`: esto no es histórico, es
-- "el último borrador detectado".

create table if not exists public.parada_pendiente (
  clave text primary key,
  url text not null,
  titulo text not null,
  imagen_url text not null,
  caption text not null,
  publicado boolean not null default false,
  detectado_en timestamptz not null default now()
);

-- RLS activada y sin políticas, igual que el resto de tablas de este
-- proyecto: solo la service_role, que vive únicamente en el servidor.
alter table public.parada_pendiente enable row level security;
