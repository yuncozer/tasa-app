-- Cuántas sesiones **hacen algo**, no cuántas pasan.
--
-- El panel ya contaba visitas, sesiones y conversiones, pero esas tres cifras
-- no responden la pregunta con la que se cotiza un patrocinio: de la gente que
-- entra, ¿cuánta llega a operar? Una sesión con doce conversiones y doce
-- sesiones con una valen lo mismo en `conversiones` y son audiencias muy
-- distintas.
--
-- Hacen falta dos contadores más, y los dos son **de nivel sesión**, así que no
-- se pueden derivar en la app a partir de lo que ya devolvía la función: un
-- `count(distinct sesion)` filtrado exige la tabla entera delante, que es
-- exactamente lo que `analiticas_web` existe para evitar (PostgREST no agrupa,
-- y traerse decenas de miles de filas a una función serverless es lo que el
-- proyecto no hace en ninguna parte).
--
--   sesionesSitio          sesiones de gente usando la app
--   sesionesQueConvierten  sesiones con al menos una conversión
--   sesionesQueSeLlevanLaCifra  sesiones que copiaron o compartieron
--
-- `sesionesSitio` existe porque `sesiones` **no** es el número de gente que
-- usa la app: `registrarAtajo()` inventa una sesión aleatoria por cada clic en
-- /hoy, /wa, /ig o /laparada —no hay pestaña con la que correlacionar nada— y
-- eso infla el total con visitantes que precisamente se están yendo del sitio.
-- Medido sobre datos reales: 558 sesiones contra 367 visitas, con 225 clics en
-- atajos por medio. Para el uso interno daba igual; para la cifra que se le
-- enseña a un anunciante, no: sería la primera que alguien comprobaría.
--
-- La segunda mide la intención más fuerte que esta app puede observar: quien
-- copia o comparte un monto lo va a usar fuera, casi siempre en un chat. Las
-- dos van juntas porque cuentan el mismo embudo —entrar, operar, llevarse el
-- resultado— y separarlas en dos consultas sería dos viajes para una pantalla.
--
-- `compartir` entra en la segunda desde el primer día: el tipo se añadió al
-- conjunto cerrado de `lib/analiticas-web.ts` en el mismo despliegue que el
-- botón, así que no hay un hueco de datos que explicar.
--
-- Todo lo demás de la función queda igual, incluida la agrupación de
-- `/convertir/*` que introdujo la migración 0018.

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
      count(distinct r.sesion) filter (where r.tipo <> 'atajo') as sesiones_sitio,
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
        'sesionesSitio', count(distinct sesion) filter (where tipo <> 'atajo'),
        'conversiones', count(*) filter (where tipo = 'conversion'),
        'copias', count(*) filter (where tipo = 'copiar'),
        'instalaciones', count(*) filter (where tipo = 'instalar'),
        'sesionesInstaladas', count(distinct sesion) filter (where instalada),
        'sesionesSinConexion', count(distinct sesion) filter (where tipo = 'sin_conexion'),
        'atajos', count(*) filter (where tipo = 'atajo'),
        'sesionesQueConvierten', count(distinct sesion) filter (where tipo = 'conversion'),
        'sesionesQueSeLlevanLaCifra',
          count(distinct sesion) filter (where tipo in ('copiar', 'compartir'))
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
