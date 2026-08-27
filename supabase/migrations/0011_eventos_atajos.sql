-- Los atajos del dominio (`/hoy`, `/wa`, `/ig`, `/laparada`, `/p/<slug>`) se
-- cuentan, y el resumen los desglosa.
--
-- Son los enlaces que viajan en los captions de Instagram y en el mensaje del
-- canal de WhatsApp, o sea la única forma de saber cuánta gente vuelve del
-- feed al contenido. Se registran como eventos de tipo 'atajo' en la misma
-- tabla `eventos_web` —no hace falta tabla nueva: un clic en un atajo es un
-- evento más, con el atajo en `detalle`— así que esto solo reemplaza la
-- función del resumen.
--
-- Dos detalles del conteo:
--
-- - Los atajos se cuentan por **eventos** y no por sesiones distintas. Se
--   registran en el servidor, donde no hay pestaña con la que correlacionar
--   nada, así que cada clic trae una `sesion` propia y contar sesiones sería
--   contar lo mismo con otro nombre.
-- - Por eso mismo quedan **fuera del listado general de referentes**: con una
--   sesión por clic, inflarían esa lista y taparían de dónde llega el tráfico
--   que sí se queda en el sitio. Tienen la suya (`referentesAtajos`).

create or replace function public.analiticas_web(desde date, hasta date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with rango as (
    select * from public.eventos_web where fecha between desde and hasta
  ),
  dias as (
    select generate_series(desde, hasta, interval '1 day')::date as fecha
  ),
  serie as (
    select
      d.fecha,
      count(*) filter (where r.tipo = 'visita') as visitas,
      count(distinct r.sesion) as sesiones,
      count(*) filter (where r.tipo = 'conversion') as conversiones,
      count(*) filter (where r.tipo = 'atajo') as atajos
    from dias d
    left join rango r on r.fecha = d.fecha
    group by d.fecha
    order by d.fecha
  )
  select jsonb_build_object(
    'desde', desde,
    'hasta', hasta,
    'totales', (
      select jsonb_build_object(
        'visitas', count(*) filter (where tipo = 'visita'),
        'sesiones', count(distinct sesion),
        'conversiones', count(*) filter (where tipo = 'conversion'),
        'copias', count(*) filter (where tipo = 'copiar'),
        'instalaciones', count(*) filter (where tipo = 'instalar'),
        'sesionesInstaladas', count(distinct sesion) filter (where instalada),
        'sesionesSinConexion', count(distinct sesion) filter (where tipo = 'sin_conexion'),
        'atajos', count(*) filter (where tipo = 'atajo')
      ) from rango
    ),
    'serie', coalesce((select jsonb_agg(to_jsonb(serie)) from serie), '[]'::jsonb),
    'tipos', coalesce((
      select jsonb_agg(fila) from (
        select jsonb_build_object('clave', tipo, 'total', count(*)) as fila
        from rango group by tipo order by count(*) desc
      ) t
    ), '[]'::jsonb),
    'rutas', coalesce((
      select jsonb_agg(fila) from (
        select jsonb_build_object('clave', ruta, 'total', count(*)) as fila
        from rango where tipo = 'visita' and ruta is not null
        group by ruta order by count(*) desc limit 10
      ) t
    ), '[]'::jsonb),
    'monedas', coalesce((
      select jsonb_agg(fila) from (
        select jsonb_build_object('clave', detalle, 'total', count(*)) as fila
        from rango where tipo = 'conversion' and detalle is not null
        group by detalle order by count(*) desc limit 10
      ) t
    ), '[]'::jsonb),
    'atajos', coalesce((
      select jsonb_agg(fila) from (
        select jsonb_build_object('clave', detalle, 'total', count(*)) as fila
        from rango where tipo = 'atajo' and detalle is not null
        group by detalle order by count(*) desc
      ) t
    ), '[]'::jsonb),
    'referentesAtajos', coalesce((
      select jsonb_agg(fila) from (
        select jsonb_build_object('clave', referente, 'total', count(*)) as fila
        from rango where tipo = 'atajo' and referente is not null
        group by referente order by count(*) desc limit 10
      ) t
    ), '[]'::jsonb),
    'dispositivos', coalesce((
      select jsonb_agg(fila) from (
        select jsonb_build_object('clave', dispositivo, 'total', count(distinct sesion)) as fila
        from rango where dispositivo is not null
        group by dispositivo order by count(distinct sesion) desc
      ) t
    ), '[]'::jsonb),
    'referentes', coalesce((
      select jsonb_agg(fila) from (
        select jsonb_build_object('clave', referente, 'total', count(distinct sesion)) as fila
        from rango where referente is not null and tipo <> 'atajo'
        group by referente order by count(distinct sesion) desc limit 10
      ) t
    ), '[]'::jsonb)
  );
$$;

-- `create or replace` conserva los permisos, pero se repiten por si esta
-- migración se corre sobre una base donde la función se creó a mano.
revoke all on function public.analiticas_web(date, date) from public, anon, authenticated;
grant execute on function public.analiticas_web(date, date) to service_role;
