-- Enlaces cortos del dominio propio (/hoy y compañía).
--
-- Es clave-valor y no una tabla por enlace porque lo único que se guarda es a
-- dónde apunta cada atajo. El caso real es `hoy`: el cron de tasas anota ahí el
-- permalink del carrusel que acaba de publicar, de modo que el enlace que se
-- comparte no haya que actualizarlo a mano dos veces al día.
--
-- No vive en una variable de entorno porque en Vercel un cambio de variable
-- solo entra con un despliegue nuevo, y esto cambia cada pocas horas.

create table if not exists public.enlaces (
  clave text primary key,
  url text not null,
  actualizado_en timestamptz not null default now()
);

-- RLS activada y **sin ninguna política**, igual que
-- `publicaciones_programadas`: solo la service_role, que vive únicamente en el
-- servidor, salta el RLS. El navegador nunca habla con Supabase.
alter table public.enlaces enable row level security;
