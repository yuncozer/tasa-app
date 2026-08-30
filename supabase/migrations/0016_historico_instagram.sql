-- Seguidores día a día, porque la Graph API solo sabe decir cuántos hay hoy.
--
-- `followers_count` es un número instantáneo: no hay endpoint que devuelva
-- cuántos seguidores había hace una semana. Eso convertía la cifra del panel
-- en un dato mudo —200 seguidores no dice nada sin saber si eran 180 o 220
-- hace un mes— y la única forma de darle sentido es guardarla nosotros, igual
-- que pasó con la caducidad del token.
--
-- Una fila por día, escrita por el cron del resumen diario. La clave primaria
-- es la fecha, así que dos disparos del mismo día no duplican nada.
--
-- No se archivan alcance ni interacciones: esas la API sí las da por período
-- y con comparación contra el anterior, así que guardarlas sería mantener dos
-- veces la misma verdad.

create table if not exists public.historico_instagram (
  fecha date primary key,
  seguidores integer not null,
  publicaciones integer,
  registrado_en timestamptz not null default now()
);

-- RLS activada y sin políticas, igual que el resto de tablas de este
-- proyecto: solo la service_role, que vive únicamente en el servidor.
alter table public.historico_instagram enable row level security;
