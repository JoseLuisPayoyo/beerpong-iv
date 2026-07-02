-- Beerpong IV — Prompt 5: conteo de lista de espera en la tabla pública `stats`.
-- Ejecuta esto UNA vez en el SQL editor de Supabase.
--
-- 1) Nueva columna pública para el nº de equipos en espera.
alter table public.stats
  add column if not exists espera_count integer not null default 0;

-- 2) Actualiza la función del trigger para rellenar AMBOS contadores.
--    NOTA: se asume que `equipos_count` = equipos confirmados (es lo que el marcador
--    muestra como "inscritos" y lo que usa el tope de 48). Si tu versión anterior
--    contaba de otra forma, conserva esa línea y añade solo la de `espera_count`.
create or replace function public.refresh_equipos_count()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.stats
  set
    equipos_count = (select count(*) from public.equipos where estado = 'confirmado'),
    espera_count  = (select count(*) from public.equipos where estado = 'espera')
  where id = 1;
  return null;
end;
$$;

-- 3) Recalcula una vez el valor actual (por si ya hay filas en espera).
update public.stats
set
  equipos_count = (select count(*) from public.equipos where estado = 'confirmado'),
  espera_count  = (select count(*) from public.equipos where estado = 'espera')
where id = 1;

-- El trigger existente sobre `equipos` ya invoca refresh_equipos_count(); no hay que recrearlo.
-- `stats` ya está en la publicación de Realtime, así que el cliente recibe `espera_count` en vivo.
