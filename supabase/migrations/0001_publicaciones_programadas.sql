-- Cola de publicaciones programadas de /admin/noticia.
--
-- Guarda el post ya materializado (título, fuente, caption y public_id de
-- Cloudinary) en vez de la URL del artículo: entre que se programa y sale, el
-- portal puede editar el titular o caerse, y lo publicado dejaría de ser lo
-- que se vio en la vista previa.

create table if not exists public.publicaciones_programadas (
  id uuid primary key default gen_random_uuid(),
  publicar_en timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'publicando', 'publicada', 'fallida')),
  payload jsonb not null,
  media_id text,
  error text,
  intentos integer not null default 0,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

-- El worker siempre hace la misma pregunta: qué sigue pendiente y ya venció.
create index if not exists publicaciones_programadas_cola_idx
  on public.publicaciones_programadas (estado, publicar_en);

-- RLS activada y **sin ninguna política**, a propósito: así ni la clave
-- anónima ni la publicable pueden leer ni escribir esta tabla. Solo la
-- service_role, que vive únicamente en el servidor, salta el RLS. El navegador
-- nunca habla con Supabase: todo pasa por las rutas /api/admin/*, que ya están
-- protegidas por la cookie de sesión.
alter table public.publicaciones_programadas enable row level security;
