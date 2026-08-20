-- Distingue la mañana de la tarde dentro de `historico_tasas`.
--
-- Hasta ahora la clave primaria era (fecha, clave) y el cron de tasas escribe
-- dos veces al día: el disparo de las 6:00 pm pisaba siempre al de las 9:00
-- am, así que del día solo quedaba la última lectura. Eso bastaba para el
-- reporte semanal (compara semana contra semana, no mañana contra tarde),
-- pero no permite responder "¿cómo estuvo el dólar Binance venta antier a
-- las 6:00 pm?" si esa fila ya no existe.
--
-- `momento` no se adivina de `capturado_en`: viaja explícito desde el cron
-- (`?momento=manana|tarde` en `app/api/cron/publish-instagram/route.ts`),
-- igual que ya decide el subtítulo del caption. Para las filas que ya existen
-- se aproxima por la hora de captura en Caracas, que es lo único que hay.

alter table public.historico_tasas
  add column momento text;

update public.historico_tasas
set momento = case
  when extract(hour from capturado_en at time zone 'America/Caracas') < 13 then 'manana'
  else 'tarde'
end
where momento is null;

alter table public.historico_tasas
  alter column momento set not null;

alter table public.historico_tasas
  add constraint historico_tasas_momento_check check (momento in ('manana', 'tarde'));

-- La clave primaria pasa a (fecha, momento, clave): ahora el segundo disparo
-- del día ya no pisa al primero, sino que agrega su propia fila.
alter table public.historico_tasas drop constraint historico_tasas_pkey;
alter table public.historico_tasas add primary key (fecha, momento, clave);

-- El índice de lectura ("una clave, todas sus fechas") gana `momento` al
-- final, para que `order=fecha.desc,momento.desc` vaya directo al índice.
drop index if exists historico_tasas_serie_idx;
create index if not exists historico_tasas_serie_idx
  on public.historico_tasas (clave, fecha desc, momento desc);
