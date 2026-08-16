-- Histórico diario de tasas, para poder decir cuánto se movió cada una en la
-- semana.
--
-- Hasta ahora la app solo conocía el presente: caché de 5 minutos en memoria y
-- nada más. El reporte semanal necesita el valor de hace siete días, y sin
-- guardarlo no hay forma de calcular una variación que sea un dato en vez de
-- una estimación.
--
-- Es una fila por (fecha, clave) y no un JSON por día, por tres motivos:
--
--   1. La pregunta que se le hace a esta tabla es siempre "cuánto valía la
--      clave X alrededor del día D", que con este formato va directo al índice.
--      Con un JSON por día habría que traer la semana entera y desenrollarla en
--      JS para descubrir que justo esa clave venía nula.
--   2. Los huecos son por clave, no por día: el BCV se raspa y puede caerse
--      mientras Binance responde. Aquí esa fila sencillamente no existe, y la
--      ventana de tolerancia de `leerComparativa()` funciona por clave, que es
--      lo correcto.
--   3. Añadir una moneda nueva no toca el esquema.
--
-- El costo son ~2.500 filas al año, que es nada.

create table if not exists public.historico_tasas (
  -- Día calendario en **Caracas**, no en UTC. La conversión se hace una sola
  -- vez, al escribir (`diaCaracasISO` en `lib/format.ts`), para no tener que
  -- hacer aritmética de zona horaria en cada consulta.
  fecha date not null,

  -- Un `RateKey` de `lib/types.ts`, o 'TRM'. Sin `check` ni tabla de
  -- referencia a propósito: las claves viven en TypeScript, 'TRM' no es un
  -- `RateKey`, y un `check` obligaría a una migración cada vez que se sume una
  -- moneda. La validación vive en `lib/historico.ts`.
  clave text not null,

  -- La unidad la implica la clave, igual que en el snapshot: las `RateKey` son
  -- bolívares por unidad (`bsPerUnit`) y 'TRM' son pesos por dólar.
  valor numeric not null,

  capturado_en timestamptz not null default now(),

  -- La clave primaria es lo que hace idempotente el upsert. El cron de tasas
  -- dispara dos veces al día, así que el segundo disparo **pisa** al primero:
  -- lo que queda guardado es el último dato conocido del día, que es lo que
  -- quiere un reporte semanal. De paso, reintentar un cron fallido no duplica
  -- nada.
  primary key (fecha, clave)
);

-- La lectura va en la otra dirección que la clave primaria: una clave, muchas
-- fechas. La PK arranca por `fecha`, así que no cubre este orden.
create index if not exists historico_tasas_serie_idx
  on public.historico_tasas (clave, fecha desc);

-- RLS activada y **sin ninguna política**, igual que `enlaces` y
-- `publicaciones_programadas`: solo la service_role, que vive únicamente en el
-- servidor, salta el RLS. El navegador nunca habla con Supabase.
alter table public.historico_tasas enable row level security;
