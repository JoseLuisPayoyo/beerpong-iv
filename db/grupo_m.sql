-- Beerpong IV — grupo M (13º grupo, 3 equipos de la lista de espera).
-- Ejecutar UNA vez en el editor SQL de Supabase (staging y producción).
--
-- La tabla `grupos` nació con checks para 12 grupos (id 1–12, letra A–L,
-- turno 1–2): hay que ampliarlos antes de insertar la fila 13. Los nombres de
-- los checks pueden variar según cómo se creó la tabla, así que se tiran TODOS
-- los checks de `grupos` y se recrean con los rangos nuevos.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.grupos'::regclass and contype = 'c'
  loop
    execute format('alter table public.grupos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.grupos add check (id between 1 and 13);
alter table public.grupos add check (letra between 'A' and 'M');
alter table public.grupos add check (turno in (0, 1, 2)); -- 0 = grupo M (18:30)
alter table public.grupos add check (estado in ('pendiente', 'en_curso', 'completo'));

-- turno 0: juega a las 18:30, media hora antes del turno 1, en una sola mesa.
insert into public.grupos (id, letra, turno)
values (13, 'M', 0)
on conflict (id) do nothing;
