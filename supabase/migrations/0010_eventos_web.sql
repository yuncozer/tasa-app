-- Analítica propia de la calculadora, porque la de Vercel no responde las
-- preguntas de este proyecto.
--
-- Vercel Analytics cuenta visitas y rutas, pero no sabe qué es una
-- conversión aquí: qué moneda de origen se usa, cuántas veces se copia una
-- cifra, cuánta gente abre la app ya instalada o se queda sin conexión. Esas
-- son las preguntas que deciden qué se publica y qué se arregla, así que el
-- evento se registra aquí, en la misma base que ya usa el resto del proyecto.
--
-- Es append-only y **anónima por diseño**: no se guarda IP, ni user-agent, ni
-- nada que identifique a una persona. `sesion` es un identificador aleatorio
-- que vive en el `sessionStorage` de una pestaña y muere con ella; solo sirve
-- para no contar diez veces a quien teclea diez montos seguidos.
--
-- `fecha` es el día calendario **en Caracas**, calculado en la app con
-- `diaCaracasISO()` y no con `now()::date`: el resto del proyecto ya fecha
-- todo así (`historico_tasas`, `tasas_pendientes`) y una analítica que corte
-- el día en UTC repartiría el post de las 18:00 entre dos días distintos.

create table if not exists public.eventos_web (
  id bigserial primary key,
  ocurrido_en timestamptz not null default now(),
  fecha date not null,
  tipo text not null,
  -- Ruta de la app donde ocurrió, sin query string: `?actualizar=<marca>`
  -- convertiría cada refresco en una ruta distinta.
  ruta text,
  -- Etiqueta corta y de conjunto cerrado que matiza el evento (la moneda de
  -- origen de una conversión, la vista del historial). Nunca texto libre del
  -- usuario: aquí no se escribe nada que él haya tecleado.
  detalle text,
  sesion text not null,
  dispositivo text check (dispositivo in ('movil', 'escritorio')),
  -- Si la visita venía de la app instalada (display-mode: standalone). Es la
  -- única forma de saber si la PWA se usa de verdad o solo se instala.
  instalada boolean not null default false,
  -- Solo el host de quien refirió la visita, nunca la URL completa: el host
  -- ya dice si el tráfico viene de Instagram o de WhatsApp, y la ruta de
  -- origen puede llevar identificadores de campaña o de conversación.
  referente text
);

-- Las dos consultas que existen: "el rango de días" y "el rango de días de
-- un tipo". Nada más se pregunta a esta tabla.
create index if not exists eventos_web_fecha_idx on public.eventos_web (fecha);
create index if not exists eventos_web_tipo_fecha_idx on public.eventos_web (tipo, fecha);

-- RLS activada y sin políticas, igual que el resto de tablas de este
-- proyecto: solo la service_role, que vive únicamente en el servidor.
alter table public.eventos_web enable row level security;

-- El resumen se calcula en la base y no en la app.
--
-- PostgREST no agrupa, así que sin esto habría que traerse decenas de miles
-- de filas a una función serverless para contarlas — justo lo que el
-- proyecto evita en todas partes. Es un solo viaje y devuelve el panel
-- entero.
--
-- El rango llega en días calendario de Caracas ya resueltos por la app, por
-- lo mismo que la columna `fecha`: aquí dentro no se convierte ninguna zona
-- horaria.
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
      count(*) filter (where r.tipo = 'conversion') as conversiones
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
        'sesionesSinConexion', count(distinct sesion) filter (where tipo = 'sin_conexion')
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
        from rango where referente is not null
        group by referente order by count(distinct sesion) desc limit 10
      ) t
    ), '[]'::jsonb)
  );
$$;

-- La función queda solo para la `service_role`, que vive únicamente en el
-- servidor. Sin esto PostgREST la expondría a `anon`: cualquiera que
-- encontrara la ruta `/rest/v1/rpc/analiticas_web` leería el panel entero, y
-- la tabla está cerrada con RLS justamente para que eso no pase.
revoke all on function public.analiticas_web(date, date) from public, anon, authenticated;
grant execute on function public.analiticas_web(date, date) to service_role;
