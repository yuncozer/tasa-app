-- Publicar un carrusel con video son varios viajes a Meta con esperas de
-- procesamiento en medio, y no caben en el tope de tiempo de una función
-- serverless: la ejecución moría a mitad y la fila se quedaba en 'publicando'
-- para siempre, sin publicarse y sin poder reintentarse.
--
-- Con estas tres columnas la fila recuerda por dónde iba, así que cada disparo
-- del cron avanza un trozo acotado y el siguiente retoma donde se quedó.

alter table public.publicaciones_programadas
  add column if not exists fase text
    check (fase in ('creando', 'esperando_hijos', 'esperando_padre', 'publicando_meta')),
  -- { hijos: string[], tipos: ('imagen'|'video')[], padre?: string }
  add column if not exists contenedores jsonb,
  -- Cuándo la tomó el disparo que la tiene entre manos. Si lleva demasiado sin
  -- moverse, es que esa ejecución murió y otra puede retomarla.
  add column if not exists arrancada_en timestamptz;

-- La segunda pregunta del worker, después de "qué venció": qué quedó a medias.
create index if not exists publicaciones_programadas_en_proceso_idx
  on public.publicaciones_programadas (estado, fase, arrancada_en);
