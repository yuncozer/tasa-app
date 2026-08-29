-- Un cuarto modo para el post automático: el carrusel sin las Historias.
--
-- Los tres modos originales (`completo`, `solo_historias`, `apagado`) no
-- podían expresar la rutina que la cuenta ya tenía: de lunes a viernes el
-- disparo de la tarde publica el carrusel **sin** Historias, porque dos
-- juegos idénticos el mismo día saturan a quien mira. Esa regla vivía dentro
-- de `publicarTasasDelDia()` como un `momento !== "tarde"`, invisible desde
-- el panel e imposible de cambiar por un día.
--
-- Con `solo_carrusel` los cuatro modos son las cuatro combinaciones de las
-- dos piezas que existen —carrusel e Historias—, la rutina semanal pasa a ser
-- un valor por defecto (`modoPorDefecto()`) en vez de código escondido, y el
-- admin puede elegir cualquiera de las cuatro para un disparo concreto.

alter table public.ajustes_publicacion
  drop constraint if exists ajustes_publicacion_modo_check;

alter table public.ajustes_publicacion
  add constraint ajustes_publicacion_modo_check
  check (modo in ('completo', 'solo_carrusel', 'solo_historias', 'apagado'));
