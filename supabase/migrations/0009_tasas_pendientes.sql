-- Cola de "el cron de tasas quiso publicar, pero faltaba una tasa base".
--
-- El post diario (carrusel + Historias) no debe salir con un hueco en las
-- tasas que de verdad publica el BCV o Binance: dólar BCV, euro BCV, y
-- Binance compra/venta. Si a las 9:00 o las 18:00 alguna todavía no
-- respondió, el cron de tasas (`app/api/cron/publish-instagram`) no publica
-- y deja una fila aquí; `app/api/cron/publicar-tasas-pendientes` la reintenta
-- cada 2 minutos hasta que las cuatro estén completas.
--
-- Una fila por `(fecha, momento)`, no una cola larga: solo hace falta saber
-- si el disparo de hoy sigue esperando, mismo criterio que `snapshot_hoy` y
-- `parada_pendiente` — esto no es histórico.

create table if not exists public.tasas_pendientes (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  momento text not null check (momento in ('manana', 'tarde')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'publicada', 'abandonada')),
  intentos integer not null default 0,
  arrancada_en timestamptz,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  unique (fecha, momento)
);

create index if not exists tasas_pendientes_cola_idx
  on public.tasas_pendientes (estado, creada_en);

-- RLS activada y sin políticas, igual que el resto de tablas de este
-- proyecto: solo la service_role, que vive únicamente en el servidor.
alter table public.tasas_pendientes enable row level security;
