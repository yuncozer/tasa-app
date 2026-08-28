-- Cuándo publicó el portal el artículo de "Dólar en La Parada".
--
-- `detectado_en` dice cuándo lo vio el cron, que no es lo mismo: si la
-- vigilancia estuvo caída, o si el portal no sacó columna ese día, el cron
-- puede detectar hoy un artículo de ayer. Sin esta columna no había forma de
-- distinguir esos dos casos, y `/admin/parada` ofrecía publicar como si fuera
-- la columna del día unas cifras que ya no lo eran — pasó en producción el
-- 28 de agosto con el artículo del 27.
--
-- Sale de `article:published_time`, el mismo meta tag estándar que ya lee
-- `fetchArticle()`. Es nullable porque el portal podría no declararlo, y en
-- ese caso no se inventa una fecha: se deja pasar el borrador y la interfaz
-- avisa de que no se pudo fechar.

alter table public.parada_pendiente
  add column if not exists fecha_articulo timestamptz;
