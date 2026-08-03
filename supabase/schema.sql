-- Beerpong IV — instantánea de referencia del esquema en Supabase.
-- La base de datos YA existe (con RLS y Realtime configurados en el panel de
-- Supabase). Este archivo documenta las tablas y restricciones que usa el panel
-- de administración; no crea las policies de RLS (se gestionan en Supabase).

-- ---------------------------------------------------------------------------
-- equipos: inscripciones. Escritura pública solo vía /api/inscribir (secret key).
--          El admin autenticado lee/escribe con RLS para el rol `authenticated`.
create table if not exists public.equipos (
  id             uuid primary key default gen_random_uuid(),
  nombre_equipo  text not null,
  participante_1 text not null,
  participante_2 text not null,
  telefono       text not null,
  estado         text not null default 'confirmado'
                   check (estado in ('confirmado', 'espera', 'pagado', 'rechazado')),
  grupo_id       integer references public.grupos(id),
  pos_grupo      integer check (pos_grupo between 1 and 4),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- grupos: 13 grupos de 4 (A–L en 2 turnos + el grupo M, que juega a las
-- 18:30 con turno 0 en dos mesas). Las 13 filas ya están insertadas
-- (la del grupo M, con db/grupo_m.sql).
create table if not exists public.grupos (
  id         integer primary key check (id between 1 and 13),
  letra      text not null check (letra between 'A' and 'M'),
  turno      integer not null check (turno in (0, 1, 2)), -- 0 = M, 1 = A–F, 2 = G–L
  estado     text not null default 'pendiente'
               check (estado in ('pendiente', 'en_curso', 'completo')),
  ganador_id uuid references public.equipos(id)         -- 1º del grupo (para la porra)
);

-- ---------------------------------------------------------------------------
-- partidos: todos los cruces del torneo, de grupos a final.
create table if not exists public.partidos (
  id          uuid primary key default gen_random_uuid(),
  fase        text not null
                check (fase in ('grupo', 'dieciseisavos', 'octavos',
                                'cuartos', 'semifinal', 'final')),
  grupo_id    integer references public.grupos(id),      -- solo en fase 'grupo'
  orden       integer not null,                          -- 0-based dentro de fase/grupo
  equipo_a    uuid references public.equipos(id),
  equipo_b    uuid references public.equipos(id),
  vasos_a     integer check (vasos_a between 0 and 10),
  vasos_b     integer check (vasos_b between 0 and 10),
  ganador_id  uuid references public.equipos(id),
  estado      text not null default 'pendiente'
                check (estado in ('pendiente', 'en_juego', 'jugado')),
  publicado   boolean not null default true,  -- false = borrador: el público no lo ve
  mesa        integer,
  tanda       integer,
  actualizado timestamptz not null default now(),
  unique (fase, grupo_id, orden)
);

-- ---------------------------------------------------------------------------
-- config: interruptores globales (fila única, id=1). Lectura pública,
-- escritura del rol `authenticated` (el admin); publicada en Realtime.
create table if not exists public.config (
  id          integer primary key check (id = 1),
  modo_evento boolean not null default false  -- true: la landing redirige a /torneo
);

-- ---------------------------------------------------------------------------
-- fases: metadatos por fase, incluye el estado de la porra pública.
create table if not exists public.fases (
  nombre        text primary key,   -- 'grupos','dieciseisavos','octavos','cuartos','semifinal','final'
  orden         integer not null,
  porra_abierta boolean not null default false,
  hora_inicio   timestamptz,        -- hora objetivo de la cuenta atrás de la porra (informativa)
  puntos        integer
);

-- ---------------------------------------------------------------------------
-- participantes / apuestas: la porra pública. Ambas con RLS SIN políticas:
-- el navegador NO puede tocarlas; todo pasa por /api/porra/* con la
-- SUPABASE_SECRET_KEY. pin_hash es bcrypt (el PIN nunca se guarda en claro).
create table if not exists public.participantes (
  id        uuid primary key default gen_random_uuid(),
  mote      text not null,
  pin_hash  text not null,
  creado_en timestamptz not null default now()
);
create unique index if not exists participantes_mote_unico
  on public.participantes (lower(trim(mote)));

-- porra_stats: contadores públicos de la porra (prueba social). Solo números
-- agregados, nunca apuestas individuales. Como toda vista sin security_invoker,
-- corre con los permisos del dueño y puede contar por encima del RLS de las
-- tablas privadas. Lectura pública con la publishable key.
create or replace view public.porra_stats as
select
  (select count(*) from public.apuestas)      as apuestas,
  (select count(*) from public.participantes) as participantes;

create table if not exists public.apuestas (
  id              uuid primary key default gen_random_uuid(),
  participante_id uuid not null references public.participantes(id),
  fase            text not null references public.fases(nombre),
  partido_id      uuid references public.partidos(id),
  grupo_id        smallint references public.grupos(id),
  pick_equipo_id  uuid not null references public.equipos(id),
  creada_en       timestamptz not null default now(),
  check ((partido_id is null) <> (grupo_id is null)),  -- XOR: cruce o grupo
  unique (participante_id, partido_id),
  unique (participante_id, grupo_id)
);
