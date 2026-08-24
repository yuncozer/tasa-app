-- Campos que el admin confirma a mano en /admin/parada antes de publicar:
-- el lugar (para el badge de ubicación) y las dos cifras de compra/venta que
-- muestra el marco dedicado de "Dólar en La Parada".
--
-- No se extraen solas del cuerpo del artículo con una expresión regular: ya
-- se vio fallar ese enfoque (texto de otro artículo colándose en el cuerpo
-- scrapeado), y estas dos cifras son precisamente el dato que un lector se
-- lleva de un vistazo — un número mal leído ahí es el peor lugar posible
-- para que ocurra. El cron las deja en blanco (`compra`/`venta` nulos) y
-- `lugar` en su valor por defecto; el admin las confirma o corrige antes de
-- publicar.

alter table public.parada_pendiente
  add column if not exists lugar text not null default 'La Parada, Villa del Rosario',
  add column if not exists compra text,
  add column if not exists venta text;
