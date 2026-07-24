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
-- grupos: 12 grupos (A–L) en 2 turnos. Las 12 filas ya están insertadas.
create table if not exists public.grupos (
  id         integer primary key check (id between 1 and 12),
  letra      text not null check (letra between 'A' and 'L'),
  turno      integer not null check (turno in (1, 2)), -- 1 = A–F, 2 = G–L
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
  mesa        integer,
  tanda       integer,
  actualizado timestamptz not null default now(),
  unique (fase, grupo_id, orden)
);

-- ---------------------------------------------------------------------------
-- fases: metadatos por fase, incluye el estado de la porra pública.
create table if not exists public.fases (
  nombre        text primary key,   -- 'grupos','dieciseisavos','octavos','cuartos','semifinal','final'
  orden         integer not null,
  porra_abierta boolean not null default false,
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
