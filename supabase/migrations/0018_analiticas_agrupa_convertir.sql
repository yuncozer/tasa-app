-- Las páginas de conversión se cuentan juntas, no una por una.
--
-- `/convertir/<slug>` son 72 rutas distintas y cada visita se anota con su
-- `location.pathname`, así que el listado de "Pantallas más abiertas" —que
-- agrupa por `ruta` y devuelve las diez primeras— se llenaría de conversiones
-- sueltas con tres visitas cada una, empujando fuera a la portada y al
-- historial. El efecto es el peor posible: el panel dejaría de poder responder
-- "¿cuánta gente entra por las páginas de búsqueda?" **justo cuando empiecen a
-- funcionar**, que es la única pregunta que justifica haberlas hecho.
--
-- Se agrupan bajo `/convertir/*`, que es una fila que sí se puede leer y
-- comparar con la portada. El desglose por monto no se pierde para siempre:
-- vive en `eventos_web` sin tocar, así que el día que interese saber qué monto
-- se busca más es una consulta, no un dato que haya que empezar a recoger.
--
-- Se agrupa **aquí y no en el navegador**: `lib/analitica-cliente.ts` manda la
-- ruta tal cual, y recortarla allí sería decidir en el dispositivo qué se puede
-- preguntar después. La regla del proyecto es que el evento se guarde crudo
-- (dentro de lo anónimo) y que la lectura decida cómo agruparlo.
--
-- El resto de la función queda idéntica a la de `0011`.

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
        select jsonb_build_object('clave', pantalla, 'total', count(*)) as fila
        from (
          select case when ruta like '/convertir/%' then '/convertir/*' else ruta end as pantalla
          from rango where tipo = 'visita' and ruta is not null
        ) p
        group by pantalla order by count(*) desc limit 10
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
