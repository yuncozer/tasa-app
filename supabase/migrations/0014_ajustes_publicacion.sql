-- Apagar o recortar el post automático de un día, sin tocar el cron.
--
-- El carrusel de tasas sale dos veces al día por cron, y hasta ahora la única
-- forma de que no saliera era desactivar la tarea en cron-job.org y acordarse
-- de volver a activarla — con el riesgo obvio de dejarla apagada para
-- siempre. Un feriado, un día sin novedad o una jornada en la que ya se
-- publicó a mano son motivos legítimos para saltarse un disparo.
--
-- **Una fila por (fecha, momento), y solo cuando se aparta de lo normal.**
-- Sin fila, el disparo publica como siempre; es decir, el silencio es
-- "completo" y no hay estado que mantener. Y como la clave lleva la fecha,
-- **el ajuste caduca solo**: apagar el post de hoy no puede dejar la cuenta
-- muda mañana, que es exactamente el fallo que se quiere evitar.
--
-- Los tres modos:
--   completo        el carrusel y, en la mañana, sus dos Historias
--   solo_historias  las Historias sin el carrusel de feed
--   apagado         no se publica nada en ese disparo

create table if not exists public.ajustes_publicacion (
  fecha date not null,
  momento text not null check (momento in ('manana', 'tarde')),
  modo text not null check (modo in ('completo', 'solo_historias', 'apagado')),
  actualizado_en timestamptz not null default now(),
  primary key (fecha, momento)
);

-- RLS activada y sin políticas, igual que el resto de tablas de este
-- proyecto: solo la service_role, que vive únicamente en el servidor.
alter table public.ajustes_publicacion enable row level security;
