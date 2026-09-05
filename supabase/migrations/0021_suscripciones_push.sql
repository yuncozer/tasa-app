-- A quién avisar cuando salen las tasas del día.
--
-- Es la primera tabla del proyecto que guarda **algo por dispositivo**, y
-- conviene decir con precisión qué significa eso, porque el resto de la
-- analítica es anónima por diseño y esto no la contradice pero sí la roza.
--
-- Una suscripción push **es** un identificador: el `endpoint` es una URL única
-- que el navegador genera para ese dispositivo, y sin ella no hay forma física
-- de entregarle nada. No se puede tener aviso y no guardar nada. Lo que sí se
-- puede es que sea **lo único** que se guarde:
--
-- - **Sin vínculo con `eventos_web`.** No se anota la `sesion` que la creó, ni
--   se registra un evento al suscribirse. Nadie puede cruzar "quién está
--   suscrito" con "qué hizo en la app", ni siquiera nosotros.
-- - **Sin preferencias.** No hay umbral, ni monedas elegidas, ni horario: el
--   aviso es el mismo para todos, así que no hay nada que perfilar. El día que
--   se quiera un umbral por persona, eso sí es otra decisión de privacidad y
--   toca volver a esta nota.
-- - **Sin IP ni user-agent**, igual que `eventos_web`.
-- - **La borra el propio dispositivo** al desactivar el aviso, y la borra el
--   servidor sola cuando el navegador dice que caducó (404/410 al enviar). Una
--   suscripción muerta no se queda dando vueltas.
--
-- El `endpoint` es la clave primaria y no un `id` propio: es único por
-- naturaleza, y usarlo directamente hace el alta idempotente — volver a
-- suscribirse desde el mismo dispositivo actualiza su fila en vez de dejar dos,
-- que es lo que pasaría con un identificador nuestro. Mismo criterio que
-- `token_instagram` o `snapshot_hoy`: la clave la marca el dato, no un contador.
--
-- `p256dh` y `auth` son las dos claves con las que el navegador descifra el
-- mensaje. Son del dispositivo, no de una persona, y sin ellas el aviso no se
-- puede cifrar — `web-push` las exige.
create table if not exists public.suscripciones_push (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  creada_en timestamptz not null default now()
);

-- RLS activada y sin políticas, igual que el resto de tablas de este proyecto:
-- solo la service_role, que vive únicamente en el servidor. Aquí importa tanto
-- como en `token_instagram`: quien leyera esta tabla tendría la lista de
-- dispositivos a los que la cuenta puede escribir.
alter table public.suscripciones_push enable row level security;

-- Además de la RLS, se retiran los privilegios a los roles públicos, mismo
-- cinturón que `token_instagram`: que PostgREST responda "permiso denegado" en
-- vez de una lista vacía, y que no dependa de que nadie añada una política por
-- descuido.
revoke all on table public.suscripciones_push from anon, authenticated;
