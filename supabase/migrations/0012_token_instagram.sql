-- El token de Instagram, para que deje de caducar en silencio.
--
-- El token de larga duración vale 60 días y hasta ahora vivía solo en la
-- variable de entorno `IG_ACCESS_TOKEN`. Cuando caduca no falla nada visible:
-- simplemente el cron de las 9:00 deja de publicar, y uno se entera al mirar
-- el feed. Peor todavía, Meta **no expone ningún endpoint que diga cuánto le
-- queda a un token**: la única forma de saberlo es refrescarlo, y el refresco
-- devuelve un token nuevo. O sea que para vigilarlo hay que guardarlo.
--
-- De ahí esta tabla: una sola fila que se sobreescribe en cada refresco,
-- mismo patrón que `snapshot_hoy` y `parada_pendiente` — no es histórico,
-- es "el token de ahora y hasta cuándo vale".
--
-- La variable de entorno sigue siendo el respaldo y la semilla: si la tabla
-- está vacía (arranque en frío) o Supabase no responde, se publica con el
-- token del entorno, que es exactamente como funcionaba antes. Esta tabla
-- añade vigilancia, no un punto único de fallo.

create table if not exists public.token_instagram (
  clave text primary key default 'actual',
  token text not null,
  expira_en timestamptz not null,
  refrescado_en timestamptz not null default now()
);

-- RLS activada y sin políticas, igual que el resto de tablas de este
-- proyecto: solo la service_role, que vive únicamente en el servidor. Aquí
-- importa más que en ninguna otra: la fila es una credencial de publicación.
alter table public.token_instagram enable row level security;

-- Además de la RLS, se retiran los privilegios de tabla a los roles públicos.
-- Con RLS y sin políticas `anon` ya no vería ninguna fila, que es como están
-- el resto de tablas del proyecto; aquí se añade el cinturón porque la fila
-- **es una credencial de publicación**: así PostgREST responde "permiso
-- denegado" en vez de una lista vacía, y no queda dependiendo de que nadie
-- añada nunca una política por descuido.
revoke all on table public.token_instagram from anon, authenticated;
